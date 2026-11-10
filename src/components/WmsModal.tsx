import React, { useState, useMemo } from 'react';
import { GisLayer, LayerServiceType, LayerStyle } from '../types/gis';
import { 
  Globe, Radio, Server, Layers, Plus, X, 
  Check, AlertCircle, HelpCircle, 
  Sparkles, Database, Loader2,
  Search, ChevronDown, ChevronUp, ShieldAlert, Wand2,
  SlidersHorizontal
} from 'lucide-react';
import { calculateBoundingBox, detectGeometryType, extractPropertySchemas } from '../utils/geoJsonParser';
import { fetchPublicJson } from '../utils/assetUrl';

interface WmsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLayer: (newLayer: GisLayer) => void;
}

interface ServicePreset {
  id: string;
  name: string;
  serviceType: LayerServiceType;
  category: 'sp' | 'brasil' | 'basemap' | 'meio_ambiente';
  categoryLabel: string;
  description: string;
  url: string;
  layers?: string;
  format?: string;
  attribution: string;
  badge: string;
  bbox?: [number, number, number, number];
}

interface DiscoveredWmsLayer {
  name: string;
  title: string;
  abstract?: string;
  bbox?: [number, number, number, number];
}

// Catálogo oficial verificado do GeoServer DataGeo SP (contingência imediata e destaques)
const DATAGEO_FALLBACK_LAYERS: DiscoveredWmsLayer[] = [
  {
    name: 'VWM_MUNICIPIO_LIMITE_50_10_IGC_2021_POL',
    title: 'Limites Municipais do Estado de São Paulo (IGC 2021)',
    abstract: 'Malha oficial de limites municipais do Instituto Geográfico e Cartográfico de SP.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'LimiteUgrhiDAEE',
    title: 'Unidades de Gerenciamento de Recursos Hídricos - UGRHI (DAEE)',
    abstract: 'Divisão hidrográfica oficial das 22 UGRHIs do Estado de São Paulo.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'G_Reg_Hidrog_Rios',
    title: 'Regiões e Bacias Hidrográficas com Rios Estruturantes',
    abstract: 'Bacias hidrográficas paulistas e rede de drenagem principal.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'G_APRMATC',
    title: 'Mananciais Alto Tietê Cabeceiras (APRM-ATC) - Lei Estadual 15.913/2015',
    abstract: 'Área de Proteção e Recuperação dos Mananciais do Alto Tietê Cabeceiras.',
    bbox: [-46.45, -23.78, -45.70, -23.32]
  },
  {
    name: 'APRMB_SMA2010',
    title: 'Mananciais Billings (APRM-B) - Lei Estadual 13.579/2009',
    abstract: 'Área de Proteção e Recuperação dos Mananciais da Bacia Billings.',
    bbox: [-46.72, -23.98, -46.28, -23.62]
  },
  {
    name: 'APRMG_SMA2007',
    title: 'Mananciais Guarapiranga (APRM-G) - Lei Estadual 12.233/2006',
    abstract: 'Área de Proteção e Recuperação dos Mananciais da Bacia do Guarapiranga.',
    bbox: [-46.94, -24.01, -46.63, -23.64]
  },
  {
    name: 'APRMAJ_ZONEAMENTO_10_SMA_2015_POL',
    title: 'Mananciais Alto Juquery (APRM-AJ) - Zoneamento Lei 15.790/2015',
    abstract: 'Zoneamento da Área de Proteção e Recuperação dos Mananciais do Alto Juquery.',
    bbox: [-46.78, -23.45, -46.48, -23.18]
  },
  {
    name: 'Areas_Protegidas_PI_DG_UCs_Protecao_Integral',
    title: 'Unidades de Conservação Estaduais (SIAP) - Proteção Integral',
    abstract: 'Parques Estaduais, Estações Ecológicas e Reservas Biológicas do Estado de SP.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'Areas_Protegidas_US_DG_UCs_Uso_Sustentavel',
    title: 'Unidades de Conservação Estaduais (SIAP) - Uso Sustentável (APAs / ARIEs)',
    abstract: 'Áreas de Proteção Ambiental (APA), Florestas Estaduais e Reservas de Desenvolvimento Sustentável.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'BIOMA_MATA_ATLANTICA_LEI_11428_2006_5000_IBGE_2008_POL',
    title: 'Área de Aplicação da Lei da Mata Atlântica (Lei Federal 11.428/2006)',
    abstract: 'Recorte oficial para o Estado de São Paulo da área sob regime jurídico do Bioma Mata Atlântica.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'G_REGIOES_MACROMETROPOLE',
    title: 'Macrometrópole Paulista e suas Regiões Constitutivas',
    abstract: 'Delimitação regional da Macrometrópole Paulista e regiões metropolitanas.',
    bbox: [-48.60, -24.55, -44.65, -22.25]
  },
  {
    name: 'G_SETORIZACAO_LITORAL_PAULISTA',
    title: 'Setorização Costeira do Litoral Paulista',
    abstract: 'Setores do Gerenciamento Costeiro do Litoral de São Paulo.',
    bbox: [-49.32, -25.31, -44.72, -23.19]
  },
  {
    name: 'G_APPCAVIDADES',
    title: 'Área de Influência sobre o Patrimônio Espeleológico (Cavidades Naturais)',
    abstract: 'Indicador preliminar de áreas de influência de cavernas e cavidades naturais (CECAV).',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  },
  {
    name: 'AREAS_PRIORITARIAS_RESTAURACAO_PARAIBA_SUL_SMA_2018_POL',
    title: 'Áreas Prioritárias para Restauração Florestal - Bacia do Paraíba do Sul',
    abstract: 'Classificação de prioridade para restauração ecológica no Vale do Paraíba.',
    bbox: [-46.35, -23.70, -44.16, -22.35]
  },
  {
    name: 'G_asa_conama',
    title: 'Área de Segurança Aérea (ASA) - Resolução CONAMA 04/1995',
    abstract: 'Raios de restrição e segurança aeroportuária (CONAMA 04/1995).',
    bbox: [-52.63, -24.99, -43.95, -18.96]
  },
  {
    name: 'DISTRITO_MUNICIPAL_SP_SMDU',
    title: 'Distritos Municipais da Capital de São Paulo (SMDU)',
    abstract: 'Divisão administrativa dos 96 distritos do Município de São Paulo.',
    bbox: [-46.83, -24.01, -46.36, -23.36]
  },
  {
    name: 'LimiteEstadual',
    title: 'Limite Territorial Oficial do Estado de São Paulo (IGC)',
    abstract: 'Contorno territorial do Estado de São Paulo.',
    bbox: [-53.11, -25.31, -44.16, -19.78]
  }
];

const PRESET_SERVICES: ServicePreset[] = [
  {
    id: 'sp-limites-municipais',
    name: 'Malha Municipal do Estado de SP (645 Municípios - IBGE/IGC)',
    serviceType: 'geojson',
    category: 'sp',
    categoryLabel: 'Estado de São Paulo',
    description: 'Malha oficial completa com todos os 645 municípios paulistas enriquecida com metadados cadastrais do IBGE (Nome do Município, Código IBGE, Microrregião, Mesorregião, Região Imediata e Intermediária). Polígonos nítidos, leves e interativos.',
    url: 'data/sp_municipios_ibge.geojson',
    attribution: 'IBGE / IGC SP',
    badge: 'Vetor 645 Mun. + Metadados'
  },
  {
    id: 'sp-limite-estadual',
    name: 'Limite Oficial do Estado de São Paulo (IBGE / IGC SP)',
    serviceType: 'geojson',
    category: 'sp',
    categoryLabel: 'Estado de São Paulo',
    description: 'Perímetro e polígono territorial completo do Estado de São Paulo enriquecido com metadados oficiais (Capital, Código IBGE, Total de Municípios, Região Sudeste).',
    url: 'data/sp_limite_estadual.geojson',
    attribution: 'IBGE / IGC SP',
    badge: 'Vetor SP + Metadados'
  },
  {
    id: 'sp-mananciais-apm-perimetros',
    name: 'Perímetros das Áreas de Proteção aos Mananciais - APM / APRM (SIMA / DAEE)',
    serviceType: 'geojson',
    category: 'meio_ambiente',
    categoryLabel: 'Recursos Hídricos / Mananciais',
    description: 'Apenas os perímetros oficiais externos (sem preenchimento, 100% vazado) das Áreas de Proteção e Recuperação aos Mananciais (APRM Billings, Guarapiranga, Juquery e Cabeceiras do Tietê). Traçado perimetral nítido para sobreposição territorial.',
    url: 'data/mananciais_apm_sp.geojson',
    attribution: 'DataGeo SP / SIMA / DAEE / CETESB',
    badge: 'Perímetro Vazado (APM)',
    bbox: [-46.9425, -24.0082, -45.6325, -23.2189]
  },
  {
    id: 'datageo-bacias',
    name: 'DataGeo SP - UGRHI & Bacias Hidrográficas (DAEE / SIGRH)',
    serviceType: 'geojson',
    category: 'meio_ambiente',
    categoryLabel: 'Recursos Hídricos',
    description: 'Todas as 22 UGRHIs (Unidades de Gerenciamento de Recursos Hídricos do Estado de SP - DAEE / SIGRH) enriquecidas com metadados cadastrais e regulatórios completos (Comitê CBH, Bacia Hidrográfica, Sede, Rios Principais, Situação Hídrica e Diretrizes GRAPROHAB).',
    url: 'data/sp_ugrhi_bacias.geojson',
    attribution: 'DataGeo SP / DAEE / SIGRH',
    badge: 'Vetor 22 UGRHIs + Metadados',
    bbox: [-53.15, -25.35, -44.11, -19.73]
  }
];

const normalizeSearchText = (str: string): string =>
  str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const WmsModal: React.FC<WmsModalProps> = ({
  isOpen,
  onClose,
  onAddLayer
}) => {
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');
  
  const [serviceType, setServiceType] = useState<LayerServiceType>('wms');
  const [layerName, setLayerName] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');
  const [wmsLayers, setWmsLayers] = useState('');
  const [wmsFormat, setWmsFormat] = useState('image/png');
  const [wmsVersion, setWmsVersion] = useState('1.1.1');
  const [attribution, setAttribution] = useState('');
  const [opacity, setOpacity] = useState(0.8);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);
  const [successPresetId, setSuccessPresetId] = useState<string | null>(null);

  // Simplified custom tab state
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  // Advanced WMS inspection & searchable layer explorer state
  const [isInspecting, setIsInspecting] = useState(false);
  const [discoveredLayers, setDiscoveredLayers] = useState<DiscoveredWmsLayer[]>([]);
  const [layerSearchQuery, setLayerSearchQuery] = useState('');
  const [selectedLayerBbox, setSelectedLayerBbox] = useState<[number, number, number, number] | null>(null);
  const [inspectMessage, setInspectMessage] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);

  // Check for HTTP mixed content on HTTPS origin
  const isMixedContent = typeof window !== 'undefined' && 
    window.location.protocol === 'https:' && 
    serviceUrl.trim().toLowerCase().startsWith('http://');

  // Filtered layers based on user search query
  const filteredDiscoveredLayers = useMemo(() => {
    if (!layerSearchQuery.trim()) return discoveredLayers;
    const q = normalizeSearchText(layerSearchQuery.trim());
    return discoveredLayers.filter(l => {
      const titleNorm = normalizeSearchText(l.title || '');
      const nameNorm = normalizeSearchText(l.name || '');
      const abstractNorm = l.abstract ? normalizeSearchText(l.abstract) : '';
      return titleNorm.includes(q) || nameNorm.includes(q) || abstractNorm.includes(q);
    });
  }, [discoveredLayers, layerSearchQuery]);

  const handleSelectDiscoveredLayer = (layer: DiscoveredWmsLayer) => {
    setWmsLayers(layer.name);
    setLayerName(layer.title || layer.name);
    if (layer.bbox) {
      setSelectedLayerBbox(layer.bbox);
    }
    setErrorMsg(null);
  };

  const handleUrlChange = (val: string) => {
    setServiceUrl(val);
    setErrorMsg(null);
    setInspectMessage(null);

    const valTrim = val.trim();
    if (!valTrim) {
      setDiscoveredLayers([]);
      setLayerSearchQuery('');
      return;
    }

    // 1. Auto-detect XYZ Tile Server
    if (valTrim.includes('{z}') && valTrim.includes('{x}')) {
      setServiceType('xyz');
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        if (valTrim.toLowerCase().includes('openstreetmap') || valTrim.toLowerCase().includes('tile.openstreetmap')) {
          setLayerName('OpenStreetMap Standard');
        } else if (valTrim.toLowerCase().includes('cartodb') || valTrim.toLowerCase().includes('basemaps.cartocdn')) {
          setLayerName('CartoDB Basemap');
        } else {
          setLayerName('Mosaico de Satélite / XYZ');
        }
      }
      return;
    }

    // 2. Auto-detect GeoJSON / REST Vector API
    if (
      valTrim.toLowerCase().endsWith('.geojson') || 
      valTrim.toLowerCase().endsWith('.json') || 
      valTrim.toLowerCase().includes('outputformat=application/json') ||
      valTrim.toLowerCase().includes('outputformat=json')
    ) {
      setServiceType('geojson');
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        const parts = valTrim.split('?')[0].split('/');
        const lastPart = parts[parts.length - 1].replace(/\.geojson|\.json/gi, '');
        if (lastPart) {
          const friendly = lastPart.replace(/_/g, ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase());
          setLayerName(friendly);
        } else {
          setLayerName('Camada Vetorial GeoJSON');
        }
      }
      return;
    }

    // 3. Auto-detect DataGeo serviceTranslator pattern:
    // e.g.: https://datageo.ambiente.sp.gov.br/serviceTranslator/rest/getXml/Geoserver_Publico/DISTRITO_MUNICIPAL_SP_SMDU/1435155780542/wms
    const translatorMatch = valTrim.match(/\/serviceTranslator\/rest\/getXml\/[^/]+\/([^/?]+)/i);
    if (translatorMatch && translatorMatch[1]) {
      setServiceType('wms');
      const extractedLayer = translatorMatch[1].trim();
      setWmsLayers(extractedLayer);
      if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
        const friendlyName = extractedLayer
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
        setLayerName(friendlyName);
      }
      return;
    }

    // 4. Default to OGC WMS if it has wms/ows/geoserver keywords or query string
    if (
      valTrim.toLowerCase().includes('wms') || 
      valTrim.toLowerCase().includes('/ows') || 
      valTrim.toLowerCase().includes('geoserver') || 
      valTrim.toLowerCase().includes('mapserver') || 
      valTrim.includes('?')
    ) {
      setServiceType('wms');

      // Pre-populate DataGeo SP curated layers immediately when DataGeo URL is pasted
      if (valTrim.toLowerCase().includes('datageo.ambiente.sp.gov.br')) {
        if (!attribution) {
          setAttribution('DataGeo SP / SIMA / IGC');
        }
        if (discoveredLayers.length === 0) {
          setDiscoveredLayers(DATAGEO_FALLBACK_LAYERS);
          setInspectMessage({
            type: 'info',
            text: `Servidor DataGeo SP reconhecido! Exibindo ${DATAGEO_FALLBACK_LAYERS.length} camadas principais abaixo. Clique em "Buscar Camadas no Servidor" para carregar o catálogo completo (950+ camadas) via proxy.`
          });
        }
      }

      if (valTrim.includes('?')) {
        try {
          const queryStr = valTrim.substring(valTrim.indexOf('?') + 1);
          const params = new URLSearchParams(queryStr);
          const layersParam = params.get('LAYERS') || params.get('layers') || params.get('Layers');
          const versionParam = params.get('VERSION') || params.get('version');
          const formatParam = params.get('FORMAT') || params.get('format');

          if (layersParam) {
            setWmsLayers(layersParam);
            if (!layerName || layerName.trim() === '' || layerName === 'Nova Camada Web' || layerName.startsWith('Serviço')) {
              const friendlyName = layersParam
                .replace(/^[a-zA-Z0-9_-]+:/, '')
                .replace(/_/g, ' ')
                .toLowerCase()
                .replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
              setLayerName(friendlyName);
            }
          }
          if (versionParam && (versionParam === '1.1.1' || versionParam === '1.3.0')) {
            setWmsVersion(versionParam);
          }
          if (formatParam) {
            setWmsFormat(formatParam);
          }
        } catch (e) {
          // Fallback silently if query string is non-standard
        }
      }
    }
  };

  const handleConvertUrlToHttps = () => {
    if (serviceUrl.trim().toLowerCase().startsWith('http://')) {
      setServiceUrl('https://' + serviceUrl.trim().substring(7));
    }
  };

  const handleSanitizeUrl = () => {
    if (serviceUrl.includes('?')) {
      const baseUrl = serviceUrl.split('?')[0].trim();
      setServiceUrl(baseUrl);
    }
  };

  const handleInspectCapabilities = async () => {
    const rawUrl = serviceUrl.trim();
    if (!rawUrl) {
      setErrorMsg('Informe a URL base do servidor WMS primeiro.');
      return;
    }

    const baseUrl = rawUrl.includes('?') ? rawUrl.split('?')[0].trim() : rawUrl;
    const isDataGeo = baseUrl.toLowerCase().includes('datageo.ambiente.sp.gov.br');

    setIsInspecting(true);
    setErrorMsg(null);
    setInspectMessage({
      type: 'info',
      text: isDataGeo
        ? 'Consultando catálogo completo no GeoServer DataGeo SP via Proxy OGC (o XML possui ~1.3 MB e pode levar de 8 a 15 segundos)...'
        : 'Consultando documento GetCapabilities no servidor WMS via Proxy...'
    });

    try {
      // 1. Primary Method: Server-side proxy (/api/wms/capabilities) to bypass browser CORS and parse large XMLs
      const proxyUrl = `/api/wms/capabilities?url=${encodeURIComponent(baseUrl)}&version=${encodeURIComponent(wmsVersion || '1.1.1')}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 28000);

      const res = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.layers) && data.layers.length > 0) {
          // If it's DataGeo SP, put the curated high-priority layers at the top followed by all remaining layers from the XML
          let mergedLayers: DiscoveredWmsLayer[] = data.layers;
          if (isDataGeo) {
            const curatedNames = new Set(DATAGEO_FALLBACK_LAYERS.map(l => l.name));
            const remaining = data.layers.filter((l: DiscoveredWmsLayer) => !curatedNames.has(l.name));
            mergedLayers = [...DATAGEO_FALLBACK_LAYERS, ...remaining];
          }

          setDiscoveredLayers(mergedLayers);
          setInspectMessage({
            type: 'success',
            text: `Sucesso! ${mergedLayers.length} camadas identificadas no servidor${data.cached ? ' (cache instantâneo)' : ''}. Use o campo de busca abaixo para filtrar por nome ou código.`
          });
          setIsInspecting(false);
          return;
        }
      }

      // 2. Fallback: Direct browser fetch if backend proxy route is unavailable (e.g. static hosting)
      const capsUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=${wmsVersion || '1.1.1'}`;
      const directController = new AbortController();
      const directTimeout = setTimeout(() => directController.abort(), 20000);

      const directRes = await fetch(capsUrl, {
        signal: directController.signal,
        headers: { 'Accept': 'application/xml, text/xml, */*' }
      });
      clearTimeout(directTimeout);

      if (!directRes.ok) {
        throw new Error(`Servidor respondeu HTTP ${directRes.status}: ${directRes.statusText}`);
      }

      const text = await directRes.text();
      const cleanedXml = text.replace(/<(?:[\w-]+:)?Style\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?Style>/gi, '');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(cleanedXml, 'text/xml');

      const layerNodes = xmlDoc.getElementsByTagName('Layer');
      const found: DiscoveredWmsLayer[] = [];

      for (let i = 0; i < layerNodes.length; i++) {
        const node = layerNodes[i];
        const nameNode = node.getElementsByTagName('Name')[0];
        const titleNode = node.getElementsByTagName('Title')[0];
        if (nameNode && nameNode.textContent && nameNode.textContent.trim()) {
          const lName = nameNode.textContent.trim();
          if (lName.toUpperCase() !== 'OGC:WMS' && !found.some(f => f.name === lName)) {
            found.push({
              name: lName,
              title: titleNode?.textContent?.trim() || lName,
              abstract: node.getElementsByTagName('Abstract')[0]?.textContent?.trim()
            });
          }
        }
      }

      if (found.length > 0) {
        setDiscoveredLayers(found);
        setInspectMessage({
          type: 'success',
          text: `Sucesso! ${found.length} camada(s) identificada(s) no servidor. Escolha uma na lista abaixo.`
        });
      } else {
        throw new Error('Nenhuma camada publicável foi encontrada no XML.');
      }
    } catch (err: any) {
      console.warn('Aviso ao inspecionar GetCapabilities:', err);
      if (isDataGeo) {
        setDiscoveredLayers(DATAGEO_FALLBACK_LAYERS);
        setInspectMessage({
          type: 'warning',
          text: `O GeoServer do DataGeo SP demorou para responder ao XML completo, mas carregamos automaticamente o catálogo oficial com ${DATAGEO_FALLBACK_LAYERS.length} camadas verificadas abaixo. Você também pode digitar qualquer código em Opções Avançadas.`
        });
      } else {
        setInspectMessage({
          type: 'warning',
          text: 'Não foi possível ler o catálogo XML deste servidor automaticamente (possível bloqueio de CORS ou tempo limite excedido). Preencha o Nome Técnico da Camada (LAYERS) manualmente em Opções Avançadas.'
        });
        setShowAdvancedOptions(true);
      }
    } finally {
      setIsInspecting(false);
    }
  };

  if (!isOpen) return null;

  const handleAddPreset = async (preset: ServicePreset) => {
    setLoadingPresetId(preset.id);
    setErrorMsg(null);

    try {
      if (preset.serviceType === 'geojson') {
        const geojson = await fetchPublicJson(preset.url);
        const features = geojson.features || [];
        if (features.length === 0) {
          throw new Error('Nenhuma feição geográfica encontrada no arquivo.');
        }

        const isEstadual = preset.id.includes('estadual');
        const isMananciais = preset.id.includes('mananciais') || preset.id.includes('apm');
        const isBacias = preset.id.includes('bacias') || preset.id.includes('ugrhi');
        const bbox = preset.bbox || calculateBoundingBox(features);
        const geomType = detectGeometryType(features);

        const style: LayerStyle = {
          fillColor: isMananciais ? 'transparent' : (isBacias ? '#38bdf8' : (isEstadual ? '#38bdf8' : '#0ea5e9')),
          strokeColor: isMananciais ? '#0284c7' : (isBacias ? '#0369a1' : (isEstadual ? '#0284c7' : '#334155')),
          strokeWidth: isMananciais ? 2.5 : (isBacias ? 2.0 : (isEstadual ? 3 : 1.2)),
          fillOpacity: isMananciais ? 0 : (isBacias ? 0.12 : (isEstadual ? 0.16 : 0.08)),
          strokeOpacity: isMananciais ? 1.0 : (isBacias ? 0.95 : (isEstadual ? 0.95 : 0.75)),
          pointRadius: 6,
          pointShape: 'circle'
        };

        const isMunicipais = preset.id.includes('municipais');
        const popupTitleField = 'nome';
        const popupFieldOrder = isMunicipais
          ? ['nome', 'codigo_ibge', 'microrregiao', 'mesorregiao', 'regiao_imediata', 'regiao_intermediaria', 'uf', 'estado', 'regiao', 'fonte']
          : isEstadual
          ? ['nome', 'sigla', 'codigo_ibge', 'capital', 'regiao', 'pais', 'municipios_total', 'fonte']
          : isMananciais
          ? ['nome', 'sigla', 'legislacao', 'tipo', 'gestao']
          : isBacias
          ? ['nome', 'ugrhi', 'sigla_comite', 'comite_bacia', 'bacia_hidrografica', 'sede_administrativa', 'num_municipios', 'rios_principais', 'situacao_hidrica', 'diretrizes_graprohab', 'legislacao', 'orgao_gestor', 'fonte']
          : undefined;

        const newLayer: GisLayer = {
          id: `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: preset.name,
          description: preset.description,
          geometryType: geomType,
          serviceType: 'geojson',
          isServiceLayer: true,
          data: {
            type: 'FeatureCollection',
            features: features
          },
          visible: true,
          opacity: 1.0,
          style: style,
          filters: [],
          featureCount: features.length,
          filteredCount: features.length,
          propertiesSchema: extractPropertySchemas(features),
          popupTitleField: popupTitleField,
          popupFieldOrder: popupFieldOrder,
          bbox: bbox,
          createdAt: Date.now()
        };

        onAddLayer(newLayer);
        setSuccessPresetId(preset.id);
        setTimeout(() => {
          setSuccessPresetId(null);
          setLoadingPresetId(null);
          onClose();
        }, 700);
        return;
      }

      // Handle WMS / XYZ Presets
      const newId = `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStyle: LayerStyle = {
        fillColor: '#38bdf8',
        strokeColor: '#0284c7',
        strokeWidth: 2,
        fillOpacity: 0.5,
        strokeOpacity: 0.8,
        pointRadius: 6,
        pointShape: 'circle'
      };

      const newLayer: GisLayer = {
        id: newId,
        name: preset.name,
        description: preset.description,
        geometryType: 'Raster',
        serviceType: preset.serviceType,
        isServiceLayer: true,
        data: {
          type: 'FeatureCollection',
          features: []
        },
        visible: true,
        opacity: preset.serviceType === 'xyz' ? 0.75 : 0.85,
        style: defaultStyle,
        filters: [],
        featureCount: 0,
        filteredCount: 0,
        propertiesSchema: [],
        bbox: preset.bbox || [-53.1, -25.3, -44.1, -19.7],
        createdAt: Date.now(),
        wmsConfig: preset.serviceType === 'wms' ? {
          url: preset.url,
          layers: preset.layers || '',
          format: preset.format || 'image/png',
          transparent: true,
          version: '1.1.1',
          attribution: preset.attribution
        } : undefined,
        xyzConfig: preset.serviceType === 'xyz' ? {
          url: preset.url,
          attribution: preset.attribution,
          maxZoom: 19
        } : undefined
      };

      onAddLayer(newLayer);
      setSuccessPresetId(preset.id);
      setTimeout(() => {
        setSuccessPresetId(null);
        setLoadingPresetId(null);
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Erro ao adicionar preset:', err);
      setErrorMsg(err.message || 'Falha ao conectar com o serviço.');
      setLoadingPresetId(null);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const rawUrl = serviceUrl.trim();
    const cleanUrl = (serviceType === 'wms' && rawUrl.includes('?'))
      ? rawUrl.split('?')[0].trim()
      : rawUrl;
    const cleanName = layerName.trim() || 'Nova Camada Web';

    if (!cleanUrl) {
      setErrorMsg('Por favor informe a URL do serviço.');
      return;
    }

    if (serviceType === 'wms' && !wmsLayers.trim()) {
      setShowAdvancedOptions(true);
      setErrorMsg('Selecione uma camada na lista abaixo ou informe o Nome Técnico da Camada (LAYERS) em Opções Avançadas.');
      return;
    }

    setIsLoading(true);

    try {
      const newId = `layer_service_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const defaultStyle: LayerStyle = {
        fillColor: '#38bdf8',
        strokeColor: '#0284c7',
        strokeWidth: 2,
        fillOpacity: 0.5,
        strokeOpacity: 0.8,
        pointRadius: 6,
        pointShape: 'circle'
      };

      if (serviceType === 'geojson') {
        const res = await fetch(cleanUrl);
        if (!res.ok) {
          throw new Error(`Falha na requisição HTTP: ${res.status} ${res.statusText}`);
        }
        const geojson = await res.json();
        if (!geojson || (!geojson.features && geojson.type !== 'FeatureCollection')) {
          throw new Error('A resposta da URL não é um GeoJSON FeatureCollection válido.');
        }

        const features = geojson.features || [];
        const newLayer: GisLayer = {
          id: newId,
          name: cleanName,
          description: `Importado via URL GeoJSON/WFS: ${cleanUrl}`,
          geometryType: 'Mixed',
          serviceType: 'geojson',
          isServiceLayer: true,
          data: geojson,
          visible: true,
          opacity: opacity,
          style: defaultStyle,
          filters: [],
          featureCount: features.length,
          filteredCount: features.length,
          propertiesSchema: [],
          bbox: calculateBoundingBox(features) || [-53.1, -25.3, -44.1, -19.7],
          createdAt: Date.now()
        };

        onAddLayer(newLayer);
      } else {
        const resolvedBbox: [number, number, number, number] = selectedLayerBbox
          ? selectedLayerBbox
          : (wmsLayers.includes('DISTRITO_MUNICIPAL') || wmsLayers.includes('SMDU'))
          ? [-46.826, -24.008, -46.365, -23.368]
          : [-53.1, -25.3, -44.1, -19.7];

        const newLayer: GisLayer = {
          id: newId,
          name: cleanName,
          description: `Serviço ${serviceType.toUpperCase()} (${wmsLayers.trim()}) conectado via: ${cleanUrl}`,
          geometryType: 'Raster',
          serviceType: serviceType,
          isServiceLayer: true,
          data: {
            type: 'FeatureCollection',
            features: []
          },
          visible: true,
          opacity: opacity,
          style: defaultStyle,
          filters: [],
          featureCount: 0,
          filteredCount: 0,
          propertiesSchema: [],
          bbox: resolvedBbox,
          createdAt: Date.now(),
          wmsConfig: serviceType === 'wms' ? {
            url: cleanUrl.includes('serviceTranslator/rest/getXml')
              ? 'https://datageo.ambiente.sp.gov.br/geoserver/datageo/wms'
              : cleanUrl,
            layers: wmsLayers.trim(),
            format: wmsFormat,
            transparent: true,
            version: wmsVersion,
            attribution: attribution.trim() || (cleanUrl.includes('datageo') ? 'DataGeo SP / SIMA' : 'Serviço WMS Externo')
          } : undefined,
          xyzConfig: serviceType === 'xyz' ? {
            url: cleanUrl,
            attribution: attribution.trim() || 'Serviço XYZ Tile Server',
            maxZoom: 19
          } : undefined
        };

        onAddLayer(newLayer);
      }

      setIsLoading(false);
      onClose();
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Erro ao conectar com o serviço. Verifique a URL e CORS do servidor.');
    }
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight flex items-center gap-2">
                Conectar Web Map Service (WMS &amp; Serviços Web)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Incorpore camadas OGC WMS (GeoServer, DataGeo SP, IBGE), servidores XYZ ou WFS.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-100/60 px-6 pt-2">
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'presets'
                ? 'border-red-600 text-red-700 bg-white/80 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-red-600" />
            <span>Catálogo Pré-configurado (1 Clique)</span>
            <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.2 rounded-full tabular-nums">
              {PRESET_SERVICES.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={`pb-2.5 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'border-red-600 text-red-700 bg-white/80 rounded-t-lg font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${activeTab === 'custom' ? 'text-red-600' : 'text-slate-600'}`} />
            <span>Adicionar Serviço Personalizado</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'presets' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Selecione uma base vetorial temática oficial para carregar diretamente no mapa:</span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 tabular-nums">
                  <Database className="w-3 h-3 text-emerald-600" />
                  {PRESET_SERVICES.length} Camadas Vetoriais
                </span>
              </div>

              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold text-red-900 mb-0.5">Erro ao carregar camada pré-configurada:</p>
                    <p>{errorMsg}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {PRESET_SERVICES.map((preset) => {
                  const isSuccess = successPresetId === preset.id;
                  return (
                    <div
                      key={preset.id}
                      className="p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-red-300 hover:shadow-xs transition-all flex items-start justify-between gap-3 group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mb-1 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs text-slate-900">
                            {preset.name}
                          </span>
                          <span className="text-[11px] text-emerald-700 font-medium">
                            · Vetor Interativo · {preset.attribution}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          {preset.description}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                          <span className="truncate max-w-[320px]">{preset.url}</span>
                          {preset.layers && (
                            <span className="text-slate-500 font-sans truncate max-w-[280px]" title={preset.layers}>
                              Camada: <b>{preset.layers}</b>
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAddPreset(preset)}
                        disabled={isSuccess || loadingPresetId === preset.id}
                        className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                          isSuccess
                            ? 'bg-emerald-600 text-white'
                            : loadingPresetId === preset.id
                            ? 'bg-red-100 text-red-700 cursor-wait'
                            : 'bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 hover:border-red-600'
                        }`}
                        title="Adicionar esta camada ao mapa agora"
                      >
                        {isSuccess ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Adicionada!</span>
                          </>
                        ) : loadingPresetId === preset.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Conectando...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            <span>Adicionar</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              {/* URL Input (Campo Principal com Auto-detecção) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-800">
                    URL do Serviço de Mapa (WMS, OWS, XYZ ou GeoJSON) *
                  </label>
                  <div className="flex items-center gap-2">
                    {!serviceUrl.includes('datageo.ambiente.sp.gov.br') && (
                      <button
                        type="button"
                        onClick={() => handleUrlChange('https://datageo.ambiente.sp.gov.br/geoserver/datageo/ows?SERVICE=WMS')}
                        className="text-[10px] text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors"
                        title="Preencher com o servidor WMS oficial do DataGeo SP"
                      >
                        Usar DataGeo SP Oficial
                      </button>
                    )}
                    {serviceUrl.includes('?') && serviceType === 'wms' && (
                      <button
                        type="button"
                        onClick={handleSanitizeUrl}
                        className="text-[10px] text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 cursor-pointer transition-colors"
                        title="Remove parâmetros de consulta (?SERVICE=WMS) e deixa apenas a URL base limpa"
                      >
                        <Wand2 className="w-3 h-3 text-amber-600" />
                        <span>Limpar Parâmetros (?...)</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <input
                    type="url"
                    placeholder="Cole aqui a URL (ex: https://datageo.ambiente.sp.gov.br/geoserver/datageo/ows?SERVICE=WMS)"
                    value={serviceUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-all shadow-inner"
                    required
                  />
                  {serviceUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setServiceUrl('');
                        setLayerName('');
                        setWmsLayers('');
                        setInspectMessage(null);
                        setDiscoveredLayers([]);
                        setLayerSearchQuery('');
                        setSelectedLayerBbox(null);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                      title="Limpar campo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status e Auto-Detecção em Tempo Real */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {serviceUrl.trim() ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {serviceType === 'wms' ? (
                          <>
                            <Radio className="w-3.5 h-3.5 text-emerald-600" />
                            <span>OGC WMS detectado</span>
                            {wmsLayers && <span className="font-mono text-emerald-950 font-bold ml-1">({wmsLayers})</span>}
                          </>
                        ) : serviceType === 'xyz' ? (
                          <>
                            <Layers className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Mosaico XYZ Tiles detectado</span>
                          </>
                        ) : (
                          <>
                            <Database className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Vetor GeoJSON / REST detectado</span>
                          </>
                        )}
                      </span>

                      {isMixedContent && (
                        <button
                          type="button"
                          onClick={handleConvertUrlToHttps}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300 cursor-pointer transition-colors"
                          title="Clique para converter de http:// para https://"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                          <span>Converter para HTTPS (recomendado)</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>Cole qualquer URL WMS, OWS, XYZ ou GeoJSON. O tipo e parâmetros são reconhecidos automaticamente.</span>
                    </span>
                  )}

                  {/* Botão de GetCapabilities via Proxy quando o serviço for WMS */}
                  {serviceType === 'wms' && serviceUrl.trim() && (
                    <button
                      type="button"
                      onClick={handleInspectCapabilities}
                      disabled={isInspecting}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-700 hover:text-white border border-red-200 hover:border-red-600 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                      title="Consulta todas as camadas publicadas no servidor WMS via Proxy (sem bloqueio de CORS)"
                    >
                      {isInspecting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Consultando Servidor...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" />
                          <span>Buscar Camadas no Servidor</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Mensagem de Inspeção */}
                {inspectMessage && (
                  <div className={`mt-2.5 p-2.5 rounded-xl text-[11px] border leading-relaxed flex items-start gap-2 ${
                    inspectMessage.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : inspectMessage.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}>
                    {inspectMessage.type === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : inspectMessage.type === 'warning' ? (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <Database className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                    )}
                    <span>{inspectMessage.text}</span>
                  </div>
                )}

                {/* Explorador Interativo de Camadas Descobertas com Busca Instantânea */}
                {discoveredLayers.length > 0 && (
                  <div className="mt-3 bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-xs animate-in fade-in">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="block text-xs font-bold text-slate-800">
                        Explorador de Camadas do Servidor
                      </label>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        Exibindo {filteredDiscoveredLayers.length} de {discoveredLayers.length} camadas
                      </span>
                    </div>

                    {/* Barra de Filtro Rápido */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Filtrar por nome, tema ou código (ex: município, mananciais, ugrhi, bioma)..."
                        value={layerSearchQuery}
                        onChange={(e) => setLayerSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-red-600 transition-colors"
                      />
                      {layerSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setLayerSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                          title="Limpar filtro"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Lista de Camadas Filtradas */}
                    {filteredDiscoveredLayers.length > 0 ? (
                      <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/40">
                        {filteredDiscoveredLayers.slice(0, 150).map((item, idx) => {
                          const isSelected = wmsLayers === item.name;
                          return (
                            <button
                              key={`${item.name}_${idx}`}
                              type="button"
                              onClick={() => handleSelectDiscoveredLayer(item)}
                              className={`w-full text-left px-3 py-2 flex items-start justify-between gap-3 transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-50/90 hover:bg-emerald-100/80'
                                  : 'hover:bg-white'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className={`text-xs font-semibold leading-snug ${isSelected ? 'text-emerald-950' : 'text-slate-800'}`}>
                                  {item.title || item.name}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">
                                  Código LAYERS: <span className="text-slate-700 font-semibold">{item.name}</span>
                                </div>
                                {item.abstract && (
                                  <div className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                                    {item.abstract}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 mt-0.5">
                                {isSelected ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-600 text-white">
                                    <Check className="w-3 h-3" />
                                    Selecionada
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-600 bg-slate-200/70 hover:bg-red-100 hover:text-red-700 transition-colors">
                                    Selecionar
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        {filteredDiscoveredLayers.length > 150 && (
                          <div className="px-3 py-2 text-center text-[11px] text-slate-500 bg-slate-100/60">
                            Mostrando os primeiros 150 resultados. Refine sua busca acima para localizar camadas específicas.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 text-center border border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-500">
                        Nenhuma camada encontrada para <b>"{layerSearchQuery}"</b>. Tente outro termo ou informe o código manualmente abaixo.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Nome Técnico da Camada (Visível diretamente quando WMS para transparência total) */}
              {serviceType === 'wms' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Código Técnico da Camada (LAYERS) *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: VWM_MUNICIPIO_LIMITE_50_10_IGC_2021_POL"
                      value={wmsLayers}
                      onChange={(e) => setWmsLayers(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors shadow-inner"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Nome de Exibição no Mapa *
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: DataGeo - Limites Municipais"
                      value={layerName}
                      onChange={(e) => setLayerName(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors shadow-inner"
                      required
                    />
                  </div>
                </div>
              )}

              {serviceType !== 'wms' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nome da Camada no Mapa *
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Mosaico Satélite ou Camada GeoJSON"
                    value={layerName}
                    onChange={(e) => setLayerName(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-colors shadow-inner"
                    required
                  />
                </div>
              )}

              {/* Gaveta Retrátil de Opções Avançadas */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 transition-all">
                <button
                  type="button"
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                    <span>Opções Avançadas (Versão OGC, Formato, Opacidade, Atribuição)</span>
                  </div>
                  {showAdvancedOptions ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </button>

                {showAdvancedOptions && (
                  <div className="p-4 pt-2.5 space-y-3.5 border-t border-slate-200/80 bg-white">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Tipo de Serviço
                        </label>
                        <select
                          value={serviceType}
                          onChange={(e) => setServiceType(e.target.value as LayerServiceType)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                        >
                          <option value="wms">OGC WMS (GeoServer / MapServer)</option>
                          <option value="xyz">XYZ Tile Server ({'{z}/{x}/{y}'})</option>
                          <option value="geojson">GeoJSON / API REST</option>
                        </select>
                      </div>

                      {serviceType === 'wms' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Versão OGC WMS
                          </label>
                          <select
                            value={wmsVersion}
                            onChange={(e) => setWmsVersion(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                          >
                            <option value="1.1.1">WMS 1.1.1 (Padrão Universal Leaflet)</option>
                            <option value="1.3.0">WMS 1.3.0</option>
                          </select>
                        </div>
                      )}

                      {serviceType === 'wms' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Formato de Imagem (FORMAT)
                          </label>
                          <select
                            value={wmsFormat}
                            onChange={(e) => setWmsFormat(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600 cursor-pointer"
                          >
                            <option value="image/png">image/png (Transparente)</option>
                            <option value="image/png8">image/png8 (Leve / Rápido)</option>
                            <option value="image/jpeg">image/jpeg (Fundo Opaco)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Texto de Atribuição / Créditos
                        </label>
                        <input
                          type="text"
                          placeholder="Ex: DataGeo / SIMA SP / IBGE"
                          value={attribution}
                          onChange={(e) => setAttribution(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-red-600"
                        />
                      </div>

                      <div className="flex items-center gap-3 pt-4">
                        <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                          Opacidade:
                        </span>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={opacity}
                          onChange={(e) => setOpacity(parseFloat(e.target.value))}
                          className="flex-1 accent-red-600 cursor-pointer"
                        />
                        <span className="text-xs font-mono font-bold text-slate-700 w-10 text-right tabular-nums">
                          {Math.round(opacity * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Alerta de Erro */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-all flex items-center gap-2 cursor-pointer shadow-md shadow-red-600/20 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Conectar ao Mapa</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer info */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span>Serviços WMS e XYZ renderizam como camadas dinâmicas sobrepostas à base cartográfica.</span>
          </div>
          <span className="font-semibold text-slate-600">Padrão OGC / Leaflet</span>
        </div>
      </div>
    </div>
  );
};
