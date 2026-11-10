import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Disable HTTP caching for all static configuration and GeoJSON cartographic data files
  app.use((req, res, next) => {
    const cleanPath = req.path.toLowerCase();
    if (cleanPath.endsWith('.geojson') || cleanPath.endsWith('mapas-config.json') || cleanPath.startsWith('/data/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // In-memory cache for WMS GetCapabilities responses (15 min TTL)
  const wmsCapabilitiesCache = new Map<string, { timestamp: number; layers: Array<{ name: string; title: string; abstract?: string; bbox?: [number, number, number, number] }> }>();
  const CACHE_TTL_MS = 15 * 60 * 1000;

  const decodeXmlEntities = (str: string): string => {
    return str
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim();
  };

  const parseWmsCapabilitiesXml = (xmlText: string) => {
    // Strip <Style>...</Style> and <LegendURL>...</LegendURL> blocks so style names/titles don't get mixed up with Layer names/titles
    const cleanedXml = xmlText
      .replace(/<(?:[\w-]+:)?Style\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?Style>/gi, '')
      .replace(/<(?:[\w-]+:)?KeywordList\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?KeywordList>/gi, '');

    const found: Array<{ name: string; title: string; abstract?: string; bbox?: [number, number, number, number] }> = [];
    const seen = new Set<string>();

    // Match each <Layer ...> header up to the next nested <Layer> or </Layer>
    const layerChunkRegex = /<(?:[\w-]+:)?Layer\b[^>]*>([\s\S]*?)(?=<(?:[\w-]+:)?Layer\b|<\/(?:[\w-]+:)?Layer>)/gi;
    let match: RegExpExecArray | null;

    while ((match = layerChunkRegex.exec(cleanedXml)) !== null) {
      const chunk = match[1];
      const nameMatch = chunk.match(/<(?:[\w-]+:)?Name\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Name>/i);
      if (!nameMatch) continue;

      const rawName = decodeXmlEntities(nameMatch[1]);
      if (!rawName || rawName.toUpperCase() === 'OGC:WMS' || seen.has(rawName)) continue;

      const titleMatch = chunk.match(/<(?:[\w-]+:)?Title\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Title>/i);
      const abstractMatch = chunk.match(/<(?:[\w-]+:)?Abstract\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?Abstract>/i);

      const rawTitle = titleMatch ? decodeXmlEntities(titleMatch[1]) : rawName;
      const rawAbstract = abstractMatch ? decodeXmlEntities(abstractMatch[1]) : undefined;

      // Extract LatLonBoundingBox (WMS 1.1.1) or EX_GeographicBoundingBox (WMS 1.3.0)
      let bbox: [number, number, number, number] | undefined;
      const latLonBoxMatch = chunk.match(/<(?:[\w-]+:)?LatLonBoundingBox\b([^>]*)\/?>/i);
      if (latLonBoxMatch) {
        const attrs = latLonBoxMatch[1];
        const minx = parseFloat(attrs.match(/minx=["']([^"']+)["']/i)?.[1] || '');
        const miny = parseFloat(attrs.match(/miny=["']([^"']+)["']/i)?.[1] || '');
        const maxx = parseFloat(attrs.match(/maxx=["']([^"']+)["']/i)?.[1] || '');
        const maxy = parseFloat(attrs.match(/maxy=["']([^"']+)["']/i)?.[1] || '');
        if (!isNaN(minx) && !isNaN(miny) && !isNaN(maxx) && !isNaN(maxy)) {
          bbox = [minx, miny, maxx, maxy];
        }
      } else {
        const west = parseFloat(chunk.match(/<(?:[\w-]+:)?westBoundLongitude>([^<]+)<\//i)?.[1] || '');
        const south = parseFloat(chunk.match(/<(?:[\w-]+:)?southBoundLatitude>([^<]+)<\//i)?.[1] || '');
        const east = parseFloat(chunk.match(/<(?:[\w-]+:)?eastBoundLongitude>([^<]+)<\//i)?.[1] || '');
        const north = parseFloat(chunk.match(/<(?:[\w-]+:)?northBoundLatitude>([^<]+)<\//i)?.[1] || '');
        if (!isNaN(west) && !isNaN(south) && !isNaN(east) && !isNaN(north)) {
          bbox = [west, south, east, north];
        }
      }

      seen.add(rawName);
      found.push({
        name: rawName,
        title: rawTitle || rawName,
        abstract: rawAbstract && !rawAbstract.startsWith('Layer-Group type layer:') ? rawAbstract : undefined,
        bbox
      });
    }

    return found;
  };

  // Server-side proxy for OGC WMS GetCapabilities (bypasses browser CORS & handles large XML catalogs like DataGeo SP)
  app.get('/api/wms/capabilities', async (req, res) => {
    try {
      const rawUrl = String(req.query.url || '').trim();
      const version = String(req.query.version || '1.1.1').trim();

      if (!rawUrl || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://'))) {
        return res.status(400).json({ error: 'URL base do servidor WMS inválida ou ausente.' });
      }

      const baseUrl = rawUrl.includes('?') ? rawUrl.split('?')[0].trim() : rawUrl;
      const cacheKey = `${baseUrl.toLowerCase()}__${version}`;

      const cached = wmsCapabilitiesCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.layers.length > 0) {
        return res.json({
          status: 'ok',
          cached: true,
          count: cached.layers.length,
          layers: cached.layers
        });
      }

      const targetUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=${encodeURIComponent(version)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.ogc.wms_xml, application/xml, text/xml, */*',
          'User-Agent': 'GeoPortal-GRAPROHAB-WMS-Client/1.0'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Servidor WMS retornou HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      if (!xmlText || (!xmlText.includes('Capabilities') && !xmlText.includes('<Layer'))) {
        throw new Error('A resposta do servidor não contém um documento XML GetCapabilities válido.');
      }

      const layers = parseWmsCapabilitiesXml(xmlText);
      if (layers.length > 0) {
        wmsCapabilitiesCache.set(cacheKey, { timestamp: Date.now(), layers });
      }

      return res.json({
        status: 'ok',
        cached: false,
        count: layers.length,
        layers
      });
    } catch (err: any) {
      const isTimeout = err.name === 'AbortError' || err.message?.includes('aborted');
      return res.status(502).json({
        error: isTimeout
          ? 'O servidor WMS demorou mais de 25 segundos para responder ao GetCapabilities.'
          : (err.message || 'Falha ao consultar o GetCapabilities no servidor WMS.')
      });
    }
  });

  // Proxy for live real-time USGS earthquakes feed (avoids CORS issues)
  app.get('/api/realtime/earthquakes', async (req, res) => {
    try {
      const response = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
      if (!response.ok) {
        throw new Error(`USGS HTTP Error: ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: 'Falha ao buscar feed sísmico em tempo real', details: err.message });
    }
  });

  // Sync layers edited or uploaded in AI Studio directly to public/data/*.geojson and public/mapas-config.json
  app.post('/api/layers/sync-public', async (req, res) => {
    try {
      const { layers } = req.body;
      if (!Array.isArray(layers)) {
        return res.status(400).json({ error: 'Formato inválido: array de camadas esperado.' });
      }

      const publicDir = path.join(process.cwd(), 'public');
      const dataDir = path.join(publicDir, 'data');
      await fs.mkdir(dataDir, { recursive: true });

      const configJson: { updatedAt: number; camadas_fixas: any[] } = {
        updatedAt: Date.now(),
        camadas_fixas: []
      };

      const nameCounts: Record<string, number> = {};

      for (let i = 0; i < layers.length; i++) {
        const lyr = layers[i];
        if (!lyr) continue;

        // 1. Camadas de Serviço WMS
        if (lyr.serviceType === 'wms' && lyr.wmsConfig) {
          configJson.camadas_fixas.push({
            nome: lyr.name,
            serviceType: 'wms',
            isServiceLayer: true,
            wmsConfig: lyr.wmsConfig,
            visivel: lyr.visible,
            opacity: lyr.opacity,
            bbox: lyr.bbox,
            estilo: lyr.style
          });
          continue;
        }

        // 2. Camadas de Serviço XYZ Tile
        if (lyr.serviceType === 'xyz' && lyr.xyzConfig) {
          configJson.camadas_fixas.push({
            nome: lyr.name,
            serviceType: 'xyz',
            isServiceLayer: true,
            xyzConfig: lyr.xyzConfig,
            visivel: lyr.visible,
            opacity: lyr.opacity,
            estilo: lyr.style
          });
          continue;
        }

        // 3. Camadas Vetoriais (GeoJSON)
        let safeName = String(lyr.name || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') || `camada_${i + 1}`;

        if (nameCounts[safeName]) {
          nameCounts[safeName]++;
          safeName = `${safeName}_${nameCounts[safeName]}`;
        } else {
          nameCounts[safeName] = 1;
        }

        const layerFileName = `${safeName}.geojson`;
        const relativeFilePath = lyr.isServiceLayer && typeof lyr.url === 'string' && lyr.url.startsWith('data/')
          ? lyr.url
          : `data/${layerFileName}`;

        if (!lyr.isServiceLayer && lyr.data && Array.isArray(lyr.data.features)) {
          const fullFilePath = path.join(publicDir, relativeFilePath);
          await fs.writeFile(fullFilePath, JSON.stringify(lyr.data, null, 2), 'utf-8');
        }

        configJson.camadas_fixas.push({
          nome: lyr.name,
          arquivo: relativeFilePath,
          visivel: lyr.visible,
          opacity: lyr.opacity,
          ...(lyr.popupTitleField ? { popupTitleField: lyr.popupTitleField } : {}),
          popupVisibleFields: Array.isArray(lyr.popupVisibleFields) ? lyr.popupVisibleFields : [],
          popupFieldOrder: Array.isArray(lyr.popupFieldOrder) ? lyr.popupFieldOrder : [],
          estilo: lyr.style
        });
      }

      const configPath = path.join(publicDir, 'mapas-config.json');
      await fs.writeFile(configPath, JSON.stringify(configJson, null, 2), 'utf-8');

      return res.json({
        status: 'ok',
        updatedAt: configJson.updatedAt,
        layerCount: configJson.camadas_fixas.length
      });
    } catch (err: any) {
      console.error('Erro ao sincronizar camadas na pasta public/:', err);
      return res.status(500).json({ error: 'Falha ao gravar camadas em public/', details: err.message });
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WebMap GIS Studio rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
