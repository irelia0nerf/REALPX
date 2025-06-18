
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI } from '@google/genai';

// --- CONFIGURATION & CONSTANTS ---
const API_KEY = process.env.API_KEY;
const USE_REAL_API = false; // Switch for future API integration
const GEMINI_MODEL_NAME = 'gemini-2.5-flash-preview-04-17';

const ai = new GoogleGenAI({ apiKey: API_KEY! });

const BOOT_DURATION = 1500; // ms
const DECISION_PROCESSING_TIME = 1200; // ms for fake loading
const SCENARIO_SETUP_PROCESSING_TIME = 700; // ms 
const SIGNIFICANT_SCORE_CHANGE_THRESHOLD = 75; // For timeline event

// --- TYPE DEFINITIONS ---
interface LogEntry {
    message: string;
    timestamp: Date;
    type: 'info' | 'warning' | 'error' | 'decision' | 'system';
}

interface Flag {
    id: string;
    name: string;
    weight: number; 
    explanation: string;
    timestamp: Date;
    scenarioId?: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

interface Kpis {
    reliableWallets: number;
    averageScore: number;
    avgResponseTime: number;
}

interface Product {
    id: string;
    name: string;
    shortDescription: string;
    mainImagePlaceholder: string; 
    howItWorks: string[];
    whatItSolves: string[];
    whoWouldUse: string[];
    videoPlaceholderScript: string;
    fakeCaseStudy: { title: string; text: string; };
    fakeTestimonial: { quote: string; author: string; company: string; };
    scenarioId: string; 
    relatedFlags?: string[];
    coreModulesUsedTitles?: string[];
}

interface FlagType {
    name: string;
    weight: number;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    basePrompt: string; 
}

interface DecisionAuditEntry {
    id: string;
    timestamp: Date;
    decision: string; 
    scoreBefore: number;
    scoreAfter: number;
    details: string; 
}

type ModuleType = 'Dados' | 'Motor' | 'Interface' | 'API' | 'Orquestração' | 'Validação' | 'Segurança' | 'Core IP' | 'Conector' | 'Analytics' | 'IA/ML' | 'Infraestrutura';

interface FoundLabModule {
    id: string; // Added for unique identification in Mermaid
    title: string;
    description: string;
    moduleType: ModuleType;
    exampleInput?: string;
    exampleOutput?: string;
    visualArchitecture?: { type: 'mermaid' | 'text_diagram' | 'img_placeholder'; content: string; };
    usedInProductIds?: string[];
    isMoat?: boolean;
    impactScore?: number;
    purposeDefends?: string; 
    riskIsolates?: string; 
    activationCondition?: string;
    realWorldUse?: string; 
}

interface ToggleableModule {
    id: string;
    title: string;
    description: string; // Brief description of its role
}

interface FoundLabDocument {
    id: string;
    title: string;
    type: 'White Paper' | 'Blueprint Técnico' | 'Visão Estratégica' | 'Artigo de Pesquisa';
    summary: string;
    author?: string;
    publicationDate?: string;
    keywords: string[];
    downloadLinkPlaceholder?: string; // e.g., "path/to/document.pdf"
    readMoreLinkPlaceholder?: string; // e.g., "internal_page_link"
}

interface LastBlockContext {
    scoreBeforeDecision: number;
    scoreAfterBlock: number;
    contributingFlags: Flag[];
    decisionTime: number;
    relevantFoundLabModuleText?: string;
}

interface TimelineEvent {
    id: string;
    timestamp: Date;
    type: 'score_change' | 'critical_flag' | 'block_decision' | 'module_toggle' | 'scenario_start' | 'product_milestone';
    title: string; // This will become the primary icon/text
    description?: string; // Full text for tooltip
    data?: {
        scoreChange?: number;
        flagName?: string;
        moduleName?: string;
        moduleState?: 'active' | 'degraded';
        value?: number; // for score
    };
}

type AppMode = 'landing' | 'simulator' | 'catalog' | 'documents';


// --- STATE ---
let currentMode: AppMode = 'landing'; // Default to landing page

// Simulator State
let currentScore: number = 950;
const INITIAL_SCORE: number = 950;
let scoreHistory: number[] = [INITIAL_SCORE];
const MAX_SCORE_HISTORY: number = 30;
let activeFlags: Flag[] = [];
let logEntries: LogEntry[] = [];
let kpis: Kpis = {
    reliableWallets: 96.2,
    averageScore: 935,
    avgResponseTime: 120, // ms
};
let decisionAuditLog: DecisionAuditEntry[] = [];
let isLoadingDecision: boolean = false;
let isSettingUpScenario: boolean = false;
let activeProductDemoName: string | null = null;
let criticalTimelineEvents: TimelineEvent[] = [];


let simulationIntervalId: number | null = null;
let flagGenerationIntervalId: number | null = null;
const SCORE_UPDATE_INTERVAL: number = 10000; 
const FLAG_GENERATION_INTERVAL: number = 18000; 
let degradedModules: string[] = []; // Stores titles of degraded modules

// Impact Modal State
let lastBlockContextForImpactView: LastBlockContext | null = null;
let isImpactModalVisible: boolean = false;


// Catalog state for Core Modules
let currentModuleFilterText: string = '';
let currentModuleTypeFilter: ModuleType | 'all' = 'all';
let currentModuleMoatFilter: boolean = false;
let currentModuleSortOrder: 'alphabetical' | 'impact' = 'alphabetical';

// --- MOCK DATA & CONFIG ---
const toggleableCoreModules: ToggleableModule[] = [
    { id: 'scorelab_core_toggle', title: "ScoreLab Core", description: "Motor central de reputação e scoring." },
    { id: 'dfc_toggle', title: "Dynamic Flag Council (DFC)", description: "Orquestra e valida flags de risco." },
    { id: 'anomaly_detector_toggle', title: "Anomaly Detector", description: "Detecta comportamentos anormais."}
];

const foundLabDocumentCollection: FoundLabDocument[] = [
    {
        id: "nexus-whitepaper-001",
        title: "FoundLab Nexus: A Nova Fronteira da Confiança Digital",
        type: "White Paper",
        summary: "Uma análise aprofundada da plataforma FoundLab Nexus, detalhando sua arquitetura, os desafios de confiança que aborda e sua visão para um ecossistema digital mais seguro e transparente. Explora os princípios de design por trás do ScoreLab, SigilMesh e Veritas Protocol.",
        author: "Dr. Evelyn Hayes, Arquiteta Chefe da FoundLab",
        publicationDate: "Outubro de 2023",
        keywords: ["Confiança Digital", "Reputação Descentralizada", "Blockchain", "IA em Segurança", "Score de Risco"],
        downloadLinkPlaceholder: "#download-nexus-whitepaper",
        readMoreLinkPlaceholder: "#read-nexus-whitepaper"
    },
    {
        id: "scorelab-blueprint-002",
        title: "Blueprint Técnico: Arquitetura Avançada do ScoreLab",
        type: "Blueprint Técnico",
        summary: "Este documento oferece uma visão detalhada dos componentes internos do ScoreLab, incluindo seus algoritmos de Machine Learning, o papel do Dynamic Flag Council (DFC), e a integração com o Reputation Kernel. Destinado a engenheiros e arquitetos de sistema.",
        author: "Equipe de Engenharia FoundLab",
        publicationDate: "Janeiro de 2024",
        keywords: ["Machine Learning", "Motor de Risco", "Análise Comportamental", "Arquitetura de Software", "DFC"],
        downloadLinkPlaceholder: "#download-scorelab-blueprint"
    },
    {
        id: "reputation-vision-003",
        title: "Visão FoundLab: O Futuro dos Sistemas Reputacionais Descentralizados",
        type: "Visão Estratégica",
        summary: "Exploração das tendências futuras em identidade soberana, credenciais verificáveis e o papel da reputação programável na Web3 e além. Discute o impacto potencial de tecnologias como SigilMesh em diversos setores.",
        author: "Conselho Estratégico FoundLab",
        publicationDate: "Março de 2024",
        keywords: ["Identidade Soberana", "Web3", "NFTs de Reputação", "Credenciais Verificáveis", "Economia da Confiança"],
        readMoreLinkPlaceholder: "#read-reputation-vision"
    },
    {
        id: "aml-compliance-article-004",
        title: "IA e Blockchain no Combate à Lavagem de Dinheiro: Uma Abordagem FoundLab",
        type: "Artigo de Pesquisa",
        summary: "Artigo discutindo como a combinação de Inteligência Artificial e tecnologias Blockchain, exemplificada por produtos como Veritas Protocol e ChainBridge, pode revolucionar a eficácia e eficiência dos processos de AML/CTF.",
        publicationDate: "Fevereiro de 2024",
        keywords: ["AML", "CTF", "Compliance", "IA", "Blockchain", "RegTech"],
        downloadLinkPlaceholder: "#download-aml-article",
    }
];


const productCatalog: Product[] = [
    {
        id: 'scorelab',
        name: 'ScoreLab',
        shortDescription: 'ScoreLab é um motor de pontuação de risco transacional que utiliza Inteligência Artificial para identificar atividades suspeitas com precisão e prover insights reputacionais estratégicos.',
        mainImagePlaceholder: 'Visualização de um dashboard analítico do ScoreLab com scores dinâmicos e grafos de risco.',
        howItWorks: ["Ingestão de dados transacionais on-chain e off-chain em tempo real.", "Análise comportamental avançada e detecção de padrões complexos.", "Modelos de Machine Learning proprietários para identificação de anomalias e avaliação de risco.", "Geração de score reputacional dinâmico, ajustado contextualmente a cada interação.", "APIs robustas para integração transparente com sistemas legados e plataformas de compliance."],
        whatItSolves: ["Prevenção sofisticada de fraudes financeiras e combate à lavagem de dinheiro (AML).", "Redução drástica de falsos positivos, otimizando a eficiência das equipes de compliance.", "Aumento da agilidade e precisão em processos de Know Your Customer (KYC) e Know Your Transaction (KYT).", "Fortalecimento da confiança e integridade em ecossistemas digitais complexos."],
        whoWouldUse: ["Bancos e Instituições Financeiras de grande porte", "Exchanges Globais de Criptoativos", "Fintechs Inovadoras e Provedores de Pagamento em Escala", "Plataformas de E-commerce com alto volume transacional"],
        videoPlaceholderScript: "Declaração do CTO da FoundLab: 'Com ScoreLab, nossa arquitetura não apenas reage, mas antecipa riscos, transformando dados brutos em inteligência acionável e protegendo o core business de nossos clientes.'",
        fakeCaseStudy: { title: "Instituição Financeira Global Aumenta Detecção de Fraudes Complexas em 45% com ScoreLab", text: "Após a implementação do ScoreLab, a instituição conseguiu identificar e mitigar fraudes complexas em estágios iniciais, resultando em uma redução de 45% nas perdas financeiras e um aumento de 30% na eficiência da equipe de investigação." },
        fakeTestimonial: { quote: "A profundidade analítica e a adaptabilidade do ScoreLab forneceram uma camada de segurança e inteligência que superou todas as nossas expectativas. É um diferencial competitivo claro.", author: "Diretor de Risco Operacional", company: "Banco Internacional Consolidado" },
        scenarioId: 'scorelab_onboarding_risk',
        relatedFlags: ['High Volume Anomaly', 'Unusual Transaction Pattern', 'New Account High Activity', 'Darknet Marketplace Link'],
        coreModulesUsedTitles: ["ScoreLab Core", "Score Engine", "Anomaly Detector", "Dynamic Flag Council (DFC)", "Reputation Kernel"]
    },
    {
        id: 'sigilmesh',
        name: 'SigilMesh',
        shortDescription: 'Infraestrutura de identidade descentralizada (DID) e credenciais reputacionais verificáveis (VCs) em formato NFT, permitindo a criação de passaportes digitais auditáveis e portáteis.',
        mainImagePlaceholder: 'Representação de um passaporte digital NFT seguro, exibindo badges de reputação verificada em uma interface institucional.',
        howItWorks: ["Criação de Identidades Descentralizadas (DIDs) soberanas, ancoradas em arquiteturas blockchain seguras.", "Emissão de Credenciais Verificáveis (VCs) em formato NFT para atestar reputação, qualificações e acessos.", "Utilização de provas de conhecimento zero (ZKPs) para garantir a privacidade seletiva dos dados do usuário.", "Armazenamento distribuído e auditável de credenciais, garantindo imutabilidade e transparência.", "Integração com DApps e sistemas corporativos para autenticação e autorização baseadas em reputação granular."],
        whatItSolves: ["Fragmentação e vulnerabilidades de sistemas de identidade centralizados e silos de dados proprietários.", "Falta de controle e soberania do usuário sobre seus próprios dados identificadores e credenciais.", "Desafios de interoperabilidade de identidades entre diferentes plataformas e jurisdições.", "Construção de confiança programática em interações digitais, preservando a privacidade quando necessário."],
        whoWouldUse: ["Ecossistemas Web3 e Organizações Autônomas Descentralizadas (DAOs)", "Plataformas de Gaming e Metaverso com economias digitais", "Sistemas de Governança Digital e Votação Eletrônica Segura", "Profissionais e Empresas buscando portabilidade de reputação e credenciais verificadas"],
        videoPlaceholderScript: "Um executivo apresentando o SigilMesh em um keynote: 'SigilMesh não é apenas sobre identidade; é sobre a verificabilidade da confiança no mundo digital. Estamos construindo o futuro da reputação.'",
        fakeCaseStudy: { title: "Consórcio Industrial Implementa SigilMesh para Credenciais de Cadeia de Suprimentos", text: "Ao utilizar SigilMesh para rastrear e verificar credenciais de fornecedores e produtos, um consórcio industrial alcançou uma redução de 60% em fraudes de documentação e otimizou auditorias de conformidade." },
        fakeTestimonial: { quote: "SigilMesh nos forneceu a infraestrutura para uma governança de dados transparente e auditável, essencial para nossas operações globais.", author: "Gerente de Inovação e Supply Chain", company: "Global Manufacturing Alliance" },
        scenarioId: 'sigilmesh_identity_verification',
        relatedFlags: ['Identity Mismatch', 'Forged Credentials Alert', 'Biometric Anomaly', 'Reputation NFT Tampered'],
        coreModulesUsedTitles: ["SigilMesh (NFT Engine)", "Badges Engine", "Reputation Mapper", "KYC/AI Module", "Metadata Loader"]
    },
    {
        id: 'veritas',
        name: 'Veritas Protocol',
        shortDescription: 'Oráculo reputacional avançado que fornece vereditos em tempo real e suporta mecanismos de arbitragem para transações on-chain de alto risco.',
        mainImagePlaceholder: 'Interface do Veritas Protocol exibindo um grafo complexo de transações sob análise, com indicadores de risco e opções de mediação.',
        howItWorks: ["Análise forense de transações blockchain em tempo real utilizando IA e regras de compliance dinâmicas.", "Fornecimento de um veredito reputacional detalhado (e.g., 'Confiança Alta', 'Risco Elevado', 'Ação Bloqueada') para DApps e Smart Contracts.", "Mecanismo de 'disputa protocolar' onde um veredito pode ser contestado e reavaliado por um conselho de especialistas (simulado).", "Capacidade de acionar 'circuit breakers' ou congelamento de fundos em casos confirmados de fraude, conforme a governança do protocolo integrado.", "Registro imutável e auditável de todas as avaliações, vereditos e disputas na blockchain."],
        whatItSolves: ["Riscos inerentes a interações com Smart Contracts de origem desconhecida ou com vulnerabilidades exploráveis.", "Perdas financeiras catastróficas devido a hacks, scams e exploits sofisticados no ecossistema DeFi.", "Ausência de mecanismos de recurso ou recuperação em transações blockchain tradicionalmente irreversíveis.", "Necessidade premente de uma camada de segurança e confiança para a adoção institucional de finanças descentralizadas."],
        whoWouldUse: ["Grandes Protocolos DeFi (Lending, DEXs, Yield Farming Institucional)", "Marketplaces de NFT de alto valor e Colecionáveis Digitais Raros", "Custodiantes de Criptoativos e Fundos de Investimento em Ativos Digitais", "Plataformas de Staking e Provedores de Infraestrutura Crítica para Blockchain"],
        videoPlaceholderScript: "Um analista de risco utilizando o Veritas: 'O Veritas Protocol é a nossa linha de frente na defesa contra ameaças on-chain, oferecendo clareza em um ambiente de complexidade crescente.'",
        fakeCaseStudy: { title: "Fundo de Investimento em Cripto Evita Perda de US$50M com Alerta Antecipado do Veritas", text: "O Veritas Protocol identificou um padrão de exploração em um contrato DeFi horas antes de um ataque em larga escala, permitindo que o fundo retirasse seus ativos a tempo, prevenindo uma perda estimada em US$50 milhões." },
        fakeTestimonial: { quote: "A integração com o Veritas Protocol transformou nossa gestão de risco em DeFi. A capacidade de análise e alerta antecipado é inestimável.", author: "Portfolio Manager Sênior", company: "Digital Asset Alpha Fund" },
        scenarioId: 'veritas_trusted_wallet_contested',
        relatedFlags: ['Sanctioned Address Interaction', 'Mixer Usage Detected', 'Funds from Known Hack', 'Smart Contract Vulnerability Detected'],
        coreModulesUsedTitles: ["Chainalysis Connector", "Bitquery Connector", "Explorer Scanner", "Token Provenance", "Score Engine", "Compliance Ruleset", "Sherlock Validator"]
    },
    {
        id: 'guardianai',
        name: 'Guardian AI',
        shortDescription: 'Sistema proativo de detecção e mitigação de ameaças cibernéticas avançadas, utilizando IA para proteger infraestruturas críticas e dados sensíveis contra ataques complexos e vetores emergentes.',
        mainImagePlaceholder: 'Representação de um escudo de energia dinâmico, adaptando-se em tempo real para proteger uma rede neural complexa representando dados corporativos.',
        howItWorks: ["Monitoramento contínuo e em profundidade de logs de rede, endpoints, APIs e comportamento de usuários e sistemas.", "Análise Preditiva de Padrões de Ataque utilizando modelos de Machine Learning (incluindo Deep Learning) e Threat Intelligence Feeds globais.", "Detecção de anomalias comportamentais sutis e assinaturas de malware polimórfico em tempo real.", "Respostas automatizadas e orquestradas (SOAR) para contenção imediata de ameaças e disparo de protocolos de remediação.", "Dashboards analíticos estratégicos para visibilidade completa do panorama de segurança e postura de risco."],
        whatItSolves: ["Ataques de Ransomware direcionados, Phishing sofisticado e Spear Phishing de executivos, Ameaças Persistentes Avançadas (APTs) de atores estatais e não estatais.", "Vazamento de dados sigilosos, propriedade intelectual e informações estratégicas de negócios.", "Complexidade na gestão de segurança em ambientes híbridos e multi-cloud, reduzindo a fadiga da equipe de SOC.", "Tempo de resposta a incidentes (MTTR) inadequado frente à velocidade e sofisticação das ameaças modernas."],
        whoWouldUse: ["Corporações Globais com Infraestrutura Crítica (Financeiro, Energia, Saúde)", "Provedores de Serviços Gerenciados de Segurança (MSSPs) de alto nível", "Agências Governamentais e de Defesa com requisitos de segurança rigorosos", "Empresas de Tecnologia e SaaS que lidam com grandes volumes de dados de usuários"],
        videoPlaceholderScript: "Um CISO apresentando em uma conferência: 'Com Guardian AI, não estamos apenas construindo muros mais altos; estamos construindo um sistema imunológico digital inteligente para a organização.'",
        fakeCaseStudy: { title: "Instituição Financeira Global Neutraliza Ataque APT Coordenado em Minutos com Guardian AI", text: "Guardian AI identificou e neutralizou uma sofisticada campanha de APT que visava exfiltrar dados de clientes, correlacionando eventos discretos em múltiplos sistemas e respondendo autonomamente em menos de 3 minutos, prevenindo um incidente de segurança de grande escala." },
        fakeTestimonial: { quote: "Guardian AI é o pilar da nossa estratégia de cibersegurança. Sua capacidade de aprendizado e adaptação contínua nos dá a confiança para inovar sem comprometer a segurança.", author: "Chief Information Security Officer (CISO)", company: "Multinacional do Setor Energético" },
        scenarioId: 'guardianai_system_anomaly',
        relatedFlags: ['Anomalous System Access', 'Potential Phishing Attempt', 'Malware Signature Detected', 'Data Exfiltration Attempt'],
        coreModulesUsedTitles: ["Flag Loader", "Score Engine", "Watchdog Listener", "Anomaly Detector", "Sentinela", "Malicious Pattern DB", "Dynamic Feedback Loop"]
    },
    {
        id: 'chainbridge',
        name: 'ChainBridge',
        shortDescription: 'Gateway de interoperabilidade seguro e regulamentado que conecta carteiras digitais, sistemas bancários tradicionais e ativos digitais, atuando como uma ponte reputacional para transações entre Pix, CBDCs, criptoativos e stablecoins.',
        mainImagePlaceholder: 'Visualização de um fluxo de transação seguro e auditado conectando o sistema Pix a diversas redes blockchain através da arquitetura robusta do ChainBridge.',
        howItWorks: ["Conexão segura e certificada com APIs do sistema Pix, Open Banking e gateways de pagamento tradicionais.", "Integração nativa com múltiplas blockchains (L1s e L2s) para transações de criptoativos e stablecoins.", "Aplicação rigorosa de KYC/AML/CTF e verificação de reputação (via ScoreLab e Veritas) em todas as transações.", "Monitoramento transacional contínuo para detecção de atividades suspeitas e conformidade com regulações locais e internacionais.", "Orquestração de liquidação multi-sistemas e custódia segura para garantir a finalização atômica das transações cross-system."],
        whatItSolves: ["Atrito significativo e falta de interoperabilidade eficiente entre o sistema financeiro tradicional (Pix, Swift) e o ecossistema emergente de ativos digitais.", "Riscos complexos de compliance, lavagem de dinheiro e financiamento ao terrorismo em transações que cruzam fronteiras regulatórias e tecnológicas.", "Dificuldade para usuários institucionais e corporativos em mover valor de forma eficiente, segura e rastreável entre diferentes trilhos financeiros.", "Necessidade de uma camada robusta de confiança, identidade verificada e conformidade para transações programáticas envolvendo Pix e criptoativos."],
        whoWouldUse: ["Bancos Comerciais e de Investimento explorando serviços com ativos digitais", "Fintechs de Pagamento e Remessas Internacionais em busca de eficiência e novos mercados", "Exchanges de Criptoativos buscando integração com sistemas de pagamento instantâneo como o Pix", "Grandes Empresas e Tesourarias Corporativas gerenciando ativos em múltiplos formatos"],
        videoPlaceholderScript: "Um tesoureiro corporativo executando uma transação multimilionária entre Pix e USDC via ChainBridge com total visibilidade e controle: 'ChainBridge: a infraestrutura de confiança para a nova economia digital.'",
        fakeCaseStudy: { title: "Banco Comercial 'NacionalBank' Lança Produtos com Stablecoins para Clientes Corporativos via ChainBridge", text: "Integrando o ChainBridge, o NacionalBank conseguiu oferecer aos seus clientes corporativos a capacidade de realizar pagamentos e recebimentos internacionais utilizando stablecoins lastreadas em Real, com liquidação via Pix, reduzindo custos em 30% e o tempo de transação de dias para minutos." },
        fakeTestimonial: { quote: "ChainBridge foi a solução que nos permitiu inovar com segurança no espaço de ativos digitais, mantendo nossos rigorosos padrões de compliance e gestão de risco.", author: "Head de Produtos Digitais e Inovação", company: "NacionalBank S.A." },
        scenarioId: 'chainbridge_pix_crypto_tx',
        relatedFlags: ['High Risk Source of Funds (Pix)', 'Unverified Crypto Wallet', 'Large Cross-Border Transaction', 'Velocity Anomaly'],
        coreModulesUsedTitles: ["Token Provenance", "ScoreLab Core", "Compliance Orchestrator", "GasMonitor", "KYC/AI Module", "API Pública", "Open Finance Connector"]
    },
    {
        id: 'aistudio',
        name: 'AI Studio',
        shortDescription: 'Ambiente de desenvolvimento e experimentação para criação, teste e deployment de modelos de decisão reputacional, com APIs plugáveis, simulação avançada de carteiras e dashboards customizáveis para monitoramento de performance.',
        mainImagePlaceholder: 'Interface do AI Studio mostrando um cientista de dados configurando um pipeline de modelo de IA com nós e conexões, e visualizando um dashboard de simulação com métricas de acurácia e bias.',
        howItWorks: ["Interface visual intuitiva para design e configuração de modelos de scoring, árvores de decisão e redes neurais.", "Acesso a um sandbox robusto com dados sintéticos e históricos para simulação de comportamento de carteiras em diversos cenários.", "APIs flexíveis para ingestão de dados proprietários e conexão dinâmica com módulos FoundLab (ScoreLab, DFC, Veritas).", "Ferramentas avançadas para ajuste fino (fine-tuning) de pesos de flags, limiares de risco, hiperparâmetros de modelos e lógicas de veredito.", "Dashboards de MLOps customizáveis para monitoramento de performance de modelos em produção, detecção de drift e análise de resultados de simulação A/B."],
        whatItSolves: ["Ciclos de desenvolvimento longos e alto custo na criação e validação de modelos de risco e reputação customizados.", "Falta de agilidade para adaptar modelos a novas ameaças, mudanças regulatórias e padrões de comportamento emergentes.", "Dificuldade em validar a eficácia e o impacto de estratégias de compliance e segurança antes da implementação em produção.", "Necessidade de um ambiente seguro e controlado para experimentação e inovação em IA sem impactar sistemas críticos em operação."],
        whoWouldUse: ["Cientistas de Dados e Engenheiros de Machine Learning especializados em Risco e Fraude", "Equipes de Inovação e Laboratórios de IA em Fintechs, Bancos e Seguradoras", "Consultorias Estratégicas de Compliance, Segurança e Transformação Digital", "Desenvolvedores de DApps e Plataformas Web3 buscando integrar lógica reputacional sofisticada e customizada"],
        videoPlaceholderScript: "Um líder de equipe de IA apresentando os resultados de um novo modelo desenvolvido no AI Studio: 'Com AI Studio, capacitamos nossos times a transformar ideias em soluções de IA de ponta, com velocidade e confiança.'",
        fakeCaseStudy: { title: "Seguradora 'ProtegeMax' Desenvolve Modelo de Detecção de Fraude em Sinistros 50% Mais Preciso com AI Studio", text: "Utilizando o AI Studio, a equipe de ciência de dados da ProtegeMax criou e validou um novo modelo de detecção de fraudes em sinistros que se mostrou 50% mais preciso que a solução anterior, economizando milhões em pagamentos indevidos." },
        fakeTestimonial: { quote: "AI Studio é uma plataforma transformadora. Ela nos permite experimentar, iterar e implementar modelos de IA com uma agilidade que antes era impensável no nosso setor.", author: "Head de Data Science e IA", company: "ProtegeMax Seguros" },
        scenarioId: 'aistudio_model_simulation',
        relatedFlags: ['Model Overfitting Alert', 'Data Skew Detected in Simulation', 'API Quota Exceeded for External Data', 'Inconsistent Flag Logic'],
        coreModulesUsedTitles: ["ScoreLab Core", "Dynamic Flag Council (DFC)", "Mirror Engine", "Score Engine", "Web Dashboard", "API Pública", "Metadata Loader", "Flag Loader", "Reputational Sandbox"]
    },
    {
        id: 'nexusplatform',
        name: 'FoundLab Core',
        shortDescription: 'Plataforma de infraestrutura central que orquestra a execução de score, flags e decisões reputacionais, integrando todo o ecossistema de soluções FoundLab para fintechs, bancos e integradores.',
        mainImagePlaceholder: 'Representação de um centro de comando neural, onde dados de todos os produtos FoundLab fluem para um núcleo de processamento central, demonstrando a sinergia e inteligência da plataforma.',
        howItWorks: ["Arquitetura modular, escalável e de alta disponibilidade que integra nativamente todos os produtos e módulos FoundLab.", "Camada de dados unificada e federada para agregação, correlação e análise de informações de risco, reputação e comportamento.", "Motor de regras e políticas configurável, e API central para orquestração de fluxos de decisão complexos e em tempo real.", "Painel de controle unificado para monitoramento global da saúde do sistema, gerenciamento de configurações, versionamento de modelos e auditoria completa.", "Hooks de compliance programáticos e conectores padronizados para integração segura com sistemas legados, plataformas de parceiros e órgãos regulatórios."],
        whatItSolves: ["Fragmentação de dados e silos de informação que impedem uma visão holística e em tempo real do risco em operações distribuídas e complexas.", "Ineficiência e lentidão na resposta a incidentes de segurança e compliance devido à falta de coordenação entre ferramentas e dados.", "Dificuldade em manter a consistência e a aplicabilidade de políticas de risco e compliance em múltiplos produtos, canais e geografias.", "Necessidade de uma infraestrutura fundamental robusta, auditável e preparada para o futuro para suportar decisões críticas e estratégicas em tempo real."],
        whoWouldUse: ["Chief Risk Officers (CROs), Chief Compliance Officers (CCOs) e Chief Information Security Officers (CISOs) de grandes organizações", "Centros de Operações de Segurança (SOCs) e Times de Resposta a Incidentes (IRTs) buscando automação e orquestração", "Equipes de Prevenção à Lavagem de Dinheiro (PLD/AML) e Combate ao Financiamento do Terrorismo (CFT)", "Integradores de Sistemas e Consultorias Estratégicas que implementam soluções FoundLab em clientes corporativos"],
        videoPlaceholderScript: "Uma visão panorâmica de uma cidade inteligente e segura, com o FoundLab Core no centro, garantindo a fluidez e a confiança das interações: 'FoundLab Core: a inteligência invisível que habilita um futuro digital seguro, confiável e exponencial.'",
        fakeCaseStudy: { title: "Grupo Financeiro Global 'Unifin' Aumenta Resiliência Operacional e Reduz Custos de Compliance em 25% com FoundLab Core", text: "Ao centralizar e unificar suas operações de risco, fraude e compliance sob a plataforma FoundLab Core, o Grupo Unifin obteve uma visão 360º de suas vulnerabilidades e exposições, aumentando a resiliência operacional em 50%, reduzindo custos com ferramentas redundantes em 25% e melhorando o tempo de resposta a requisitos regulatórios." },
        fakeTestimonial: { quote: "A adoção do FoundLab Core representou um salto quântico em nossa capacidade de gerenciar riscos de forma integrada e proativa. É a espinha dorsal da nossa estratégia de confiança digital e inovação responsável.", author: "Vice-Presidente Executivo de Risco e Compliance Global", company: "Unifin Group" },
        scenarioId: 'nexus_overview_demo', 
        relatedFlags: ['High Volume Anomaly', 'Sanctioned Address Interaction', 'Anomalous System Access', 'Sybil Attack Pattern Detected', 'Cross-Product Risk Correlation'],
        coreModulesUsedTitles: ["ScoreLab Core", "Score Engine", "Dynamic Flag Council (DFC)", "Compliance Orchestrator", "Web Dashboard", "API Pública", "Reputation Kernel", "Watchdog Listener", "Reputation Archive"]
    }
];

const flagTypes: FlagType[] = [
    { name: 'High Volume Anomaly', weight: -30, severity: 'medium', basePrompt: "Explique concisamente o risco associado a uma anomalia de alto volume em transações financeiras. (Máx. 50 palavras)" },
    { name: 'Sanctioned Address Interaction', weight: -150, severity: 'critical', basePrompt: "Explique o risco crítico de interagir com um endereço blockchain sancionado. (Máx. 50 palavras)" },
    { name: 'Mixer Usage Detected', weight: -70, severity: 'high', basePrompt: "Explique o risco de fundos que passaram por um mixer de criptomoedas. (Máx. 50 palavras)" },
    { name: 'Unusual Transaction Pattern', weight: -40, severity: 'medium', basePrompt: "Explique o risco de um padrão de transação incomum ou atípico. (Máx. 50 palavras)" },
    { name: 'Darknet Marketplace Link', weight: -120, severity: 'critical', basePrompt: "Explique o risco severo de fundos vinculados a um marketplace da darknet. (Máx. 50 palavras)" },
    { name: 'Identity Mismatch', weight: -60, severity: 'high', basePrompt: "Explique o risco de uma divergência de identidade durante um processo de KYC. (Máx. 50 palavras)" },
    { name: 'Forged Credentials Alert', weight: -90, severity: 'high', basePrompt: "Explique o alto risco associado à detecção de credenciais falsificadas. (Máx. 50 palavras)" },
    { name: 'Anomalous System Access', weight: -50, severity: 'medium', basePrompt: "Explique o risco de segurança de um acesso anômalo a um sistema corporativo. (Máx. 50 palavras)" },
    { name: 'Potential Phishing Attempt', weight: -40, severity: 'medium', basePrompt: "Explique o risco de uma tentativa potencial de phishing identificada. (Máx. 50 palavras)" },
    { name: 'New Account High Activity', weight: -25, severity: 'low', basePrompt: "Explique o risco moderado de uma nova conta apresentando alta atividade transacional. (Máx. 50 palavras)" },
    { name: 'Funds from Known Hack', weight: -100, severity: 'critical', basePrompt: "Explique o risco crítico de receber fundos vinculados a um hack conhecido. (Máx. 50 palavras)" },
    { name: 'Biometric Anomaly', weight: -55, severity: 'medium', basePrompt: "Explique o risco associado a uma anomalia biométrica durante a autenticação. (Máx. 50 palavras)" },
    { name: 'Malware Signature Detected', weight: -80, severity: 'high', basePrompt: "Explique o alto risco de uma assinatura de malware conhecida detectada em um sistema. (Máx. 50 palavras)" },
    { name: 'Sybil Attack Pattern Detected', weight: -200, severity: 'critical', basePrompt: "Explique o risco crítico de um padrão de ataque Sybil detectado. (Máx. 50 palavras)" },
    { name: 'Reputation NFT Tampered', weight: -110, severity: 'critical', basePrompt: "Explique o risco crítico de um NFT de reputação apresentar sinais de adulteração. (Máx. 50 palavras)" },
    { name: 'Smart Contract Vulnerability Detected', weight: -95, severity: 'high', basePrompt: "Explique o alto risco de uma vulnerabilidade explorável detectada em um smart contract. (Máx. 50 palavras)" },
    { name: 'Data Exfiltration Attempt', weight: -85, severity: 'high', basePrompt: "Explique o alto risco de uma tentativa de exfiltração de dados identificada. (Máx. 50 palavras)" },
    { name: 'High Risk Source of Funds (Pix)', weight: -75, severity: 'high', basePrompt: "Explique o risco de receber fundos Pix de uma origem classificada como de alto risco. (Máx. 50 palavras)" },
    { name: 'Unverified Crypto Wallet', weight: -35, severity: 'medium', basePrompt: "Explique o risco de transacionar com uma carteira de criptoativos não verificada. (Máx. 50 palavras)" },
    { name: 'Large Cross-Border Transaction', weight: -45, severity: 'medium', basePrompt: "Explique o potencial risco de compliance em uma transação transfronteiriça de grande valor. (Máx. 50 palavras)" },
    { name: 'Velocity Anomaly', weight: -40, severity: 'medium', basePrompt: "Explique o risco indicado por uma anomalia na velocidade das transações (velocity). (Máx. 50 palavras)" },
    { name: 'Model Overfitting Alert', weight: -20, severity: 'low', basePrompt: "Explique a implicação de um alerta de overfitting de modelo no AI Studio. (Máx. 50 palavras)" },
    { name: 'Data Skew Detected in Simulation', weight: -15, severity: 'low', basePrompt: "Explique o problema de um desvio (skew) nos dados detectado durante uma simulação no AI Studio. (Máx. 50 palavras)" },
    { name: 'API Quota Exceeded for External Data', weight: -10, severity: 'info', basePrompt: "Explique o impacto operacional de exceder a cota de API para dados externos no AI Studio. (Máx. 50 palavras)" },
    { name: 'Inconsistent Flag Logic', weight: -25, severity: 'low', basePrompt: "Explique o risco de uma lógica de flags inconsistente configurada no AI Studio. (Máx. 50 palavras)" },
    { name: 'Cross-Product Risk Correlation', weight: -65, severity: 'medium', basePrompt: "Explique a significância de uma correlação de risco entre diferentes produtos detectada pelo FoundLab Core. (Máx. 50 palavras)" },
    { name: 'Low Activity Wallet', weight: -5, severity: 'info', basePrompt: "Descreva brevemente uma carteira com baixa atividade histórica. (Máx. 50 palavras)" }
];

const foundLabModules: FoundLabModule[] = [
    { 
        id: "scorelab_core_module",
        title: "ScoreLab Core", 
        description: "Motor central de reputação e scoring dinâmico para avaliação de risco em tempo real.",
        moduleType: "Motor",
        isMoat: true,
        impactScore: 10,
        exampleInput: "{ \"transactionId\": \"txn_123\", \"amount\": 1.5, \"currency\": \"BTC\", \"sourceAddress\": \"0xabc...\", \"destAddress\": \"0xdef...\" }",
        exampleOutput: "{ \"score\": 250, \"riskLevel\": \"medium\", \"flags\": [\"Unusual Transaction Pattern\"] }",
        visualArchitecture: { type: 'mermaid', content: "graph TD\nA[Dados da Transação] --> B(Pré-processamento e Enriquecimento);\nB --> C{Motor de Score ScoreLab};\nC --> D[Score de Risco];\nC --> E[Flags de Alerta];" },
        usedInProductIds: ["scorelab", "nexusplatform", "chainbridge", "aistudio"],
        purposeDefends: "A integridade de transações financeiras e a reputação de entidades digitais.",
        riskIsolates: "Fraude transacional, lavagem de dinheiro, atividades suspeitas e interações com entidades de alto risco.",
        activationCondition: "Qualquer transação ou interação que necessite de avaliação de risco ou reputação.",
        realWorldUse: "Bancos utilizam para analisar o risco de transferências; Exchanges para monitorar depósitos e saques de criptoativos."
    },
    { 
        id: "dfc_module",
        title: "Dynamic Flag Council (DFC)", 
        description: "Sistema de orquestração e validação de flags de risco, garantindo relevância e prevenindo sobrecarga de alertas.",
        moduleType: "Orquestração",
        isMoat: true,
        impactScore: 9,
        visualArchitecture: { type: 'text_diagram', content: "[Fluxo de Eventos Brutos] -> (Emissor de Flags Potenciais) -> [Lógica DFC: Priorização, Supressão, Enriquecimento] -> (Flags Validadas e Contextualizadas) -> [Motor de Score / Sistema de Alertas]" },
        usedInProductIds: ["scorelab", "nexusplatform", "aistudio"],
        purposeDefends: "A eficiência e precisão do sistema de detecção de riscos, evitando a fadiga de alertas.",
        riskIsolates: "Falsos positivos, sobrecarga de alertas irrelevantes, e a não detecção de riscos mascarados por múltiplas flags de baixo impacto.",
        activationCondition: "Quando múltiplas flags são geradas para um mesmo evento ou entidade, necessitando de uma avaliação consolidada.",
        realWorldUse: "Grandes plataformas financeiras para refinar seus alertas de compliance, focando apenas nos eventos verdadeiramente críticos."
    },
    { 
        id: "sherlock_validator_module",
        title: "Sherlock Validator", 
        description: "Validador de risco e compliance com fontes externas (e.g., Chainalysis, OFAC lists, dados de sanções).",
        moduleType: "Validação",
        impactScore: 8,
        exampleInput: "{ \"entityId\": \"bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh\", \"entityType\": \"address\", \"blockchain\": \"bitcoin\" }",
        exampleOutput: "{ \"isSanctioned\": true, \"sanctionLists\": [\"OFAC\"], \"knownAssociations\": [\"Hydra Marketplace\"], \"riskScoreContribution\": 85 }",
        usedInProductIds: ["veritas"],
        purposeDefends: "A conformidade regulatória e a prevenção de interações com entidades sancionadas ou ilícitas.",
        riskIsolates: "Risco de sanções, envolvimento com atividades criminosas (terrorismo, darknet), e contaminação de fundos.",
        activationCondition: "Verificação de endereços ou entidades em processos de onboarding (KYC/KYB), transações de alto valor, ou monitoramento contínuo.",
        realWorldUse: "Instituições financeiras para triagem de clientes e transações contra listas de sanções internacionais."
    },
    { 
        id: "sentinela_module",
        title: "Sentinela", 
        description: "Monitoramento em tempo real de carteiras e padrões comportamentais para detecção proativa de ameaças e desvios.",
        moduleType: "Segurança",
        impactScore: 8,
        usedInProductIds: ["guardianai"],
        purposeDefends: "Ativos digitais e contas de usuários contra acessos não autorizados e comportamentos fraudulentos.",
        riskIsolates: "Tomada de controle de contas (ATO), movimentações financeiras atípicas, e atividades preparatórias para ataques.",
        activationCondition: "Monitoramento contínuo do comportamento de usuários e sistemas; ativado por desvios significativos do padrão estabelecido.",
        realWorldUse: "Plataformas de e-commerce e bancos digitais para detectar e bloquear atividades fraudulentas em contas de clientes em tempo real."
    },
    { 
        id: "score_engine_module",
        title: "Score Engine", 
        description: "Componente central que calcula e ajusta scores de risco e reputação com base em eventos, flags e modelos de risco configuráveis.",
        moduleType: "Motor",
        impactScore: 9,
        usedInProductIds: ["scorelab", "guardianai", "nexusplatform", "aistudio", "veritas"],
        purposeDefends: "A capacidade de quantificar dinamicamente o risco ou a confiança associada a uma entidade ou transação.",
        riskIsolates: "Dependência de avaliações de risco estáticas ou manuais, permitindo uma resposta proporcional e automatizada.",
        activationCondition: "Sempre que uma nova informação (flag, evento, dado externo) relevante para o risco de uma entidade é recebida.",
        realWorldUse: "Sistemas de crédito para ajustar limites dinamicamente; plataformas de seguro para precificar apólices baseadas em comportamento."
    },
    { 
        id: "sigilmesh_engine_module",
        title: "SigilMesh (NFT Engine)", 
        description: "Geração de reputação NFT dinâmica e rastreável, tokenizando a confiança e as credenciais verificáveis.",
        moduleType: "Motor",
        isMoat: true,
        impactScore: 8,
        visualArchitecture: { type: 'mermaid', content: "graph LR\n A[Usuário] --> B{Solicita Credencial NFT};\n B --> C[Módulo de Validação de Provas];\n C -- Válido --> D[Processo de Minting SigilMesh];\n D --> E[(NFT Reputacional na Wallet do Usuário)];" },
        usedInProductIds: ["sigilmesh"],
        purposeDefends: "A soberania e portabilidade da identidade e reputação digital do usuário.",
        riskIsolates: "Falsificação de credenciais, silos de dados de reputação, e falta de controle do usuário sobre seus dados.",
        activationCondition: "Quando um usuário completa uma ação que gera uma credencial (e.g., curso, projeto) ou atinge um marco reputacional.",
        realWorldUse: "Profissionais para comprovar qualificações em plataformas de freelancing; comunidades DAO para gerenciar acesso e votação."
    },
    { 
        id: "kyc_ai_module",
        title: "KYC/AI Module", 
        description: "Valida identidade com inteligência artificial adaptativa, otimizando o onboarding e reduzindo fraudes de identidade.",
        moduleType: "IA/ML",
        impactScore: 7,
        usedInProductIds: ["sigilmesh", "chainbridge"],
        purposeDefends: "A integridade do processo de identificação de clientes e a prevenção contra identidades falsas ou roubadas.",
        riskIsolates: "Fraude de identidade, onboarding de contas para fins ilícitos, e não conformidade com regulações de KYC.",
        activationCondition: "Durante o processo de cadastro de novos usuários ou na atualização periódica de dados cadastrais.",
        realWorldUse: "Fintechs e bancos para automatizar e tornar mais seguro o processo de abertura de contas."
    },
    { 
        id: "compliance_orchestrator_module",
        title: "Compliance Orchestrator", 
        description: "Centraliza e executa políticas de conformidade programaticamente, adaptando-se a diferentes regulações e requisitos internos.",
        moduleType: "Orquestração",
        impactScore: 8,
        usedInProductIds: ["nexusplatform", "chainbridge"],
        purposeDefends: "A aderência da organização a leis, regulações e políticas internas de risco e compliance.",
        riskIsolates: "Falhas de conformidade, multas regulatórias, e danos reputacionais por não cumprimento de obrigações legais.",
        activationCondition: "Em todos os processos de negócio que possuem requisitos de compliance, como onboarding, transações, e gestão de dados.",
        realWorldUse: "Empresas multinacionais para gerenciar a complexidade de diferentes regimes regulatórios em suas operações."
    },
    { 
        id: "public_api_module",
        title: "API Pública", 
        description: "Interface para consulta externa e integração institucional de scores, vereditos e outras funcionalidades da plataforma FoundLab.",
        moduleType: "API",
        impactScore: 7,
        usedInProductIds: ["nexusplatform", "chainbridge", "aistudio"],
        purposeDefends: "A interoperabilidade e extensibilidade da plataforma FoundLab, permitindo a criação de ecossistemas.",
        riskIsolates: "Silos de dados e funcionalidades, dificuldade de integração com sistemas de parceiros e clientes.",
        activationCondition: "Quando sistemas externos necessitam consumir dados ou acionar funcionalidades da FoundLab de forma programática.",
        realWorldUse: "Parceiros de tecnologia integrando as soluções FoundLab em seus próprios produtos; clientes construindo dashboards customizados."
    },
    { 
        id: "web_dashboard_module",
        title: "Web Dashboard", 
        description: "Painel visual de monitoramento, histórico e status para operadores, analistas e gestores.",
        moduleType: "Interface",
        impactScore: 6,
        usedInProductIds: ["nexusplatform", "aistudio"],
        purposeDefends: "A visibilidade e o controle sobre as operações e o desempenho da plataforma e dos modelos.",
        riskIsolates: "Falta de transparência, dificuldade em monitorar KPIs de risco e performance, e incapacidade de realizar análises e auditorias.",
        activationCondition: "Utilizado continuamente por equipes de operações, risco e compliance para monitoramento e análise.",
        realWorldUse: "Equipes de SOC (Security Operations Center) para monitorar alertas de segurança; analistas de fraude para investigar casos suspeitos."
    },
    { 
        id: "anomaly_detector_module",
        title: "Anomaly Detector", 
        description: "Detecção de comportamentos fora do padrão utilizando modelos de IA, identificando atividades suspeitas que escapam a regras tradicionais.", 
        moduleType: "IA/ML", 
        isMoat: true, 
        impactScore: 9, 
        usedInProductIds: ["scorelab", "guardianai"],
        purposeDefends: "A segurança e integridade dos sistemas contra atividades anormais que podem indicar fraude, abuso ou comprometimento.",
        riskIsolates: "Novos tipos de fraude (zero-day), abuso de plataforma por comportamento atípico, e comprometimento de contas antes que causem dano maior.",
        activationCondition: "Monitoramento contínuo de fluxos de dados (transações, logs de acesso, comportamento do usuário) para identificar desvios estatísticos significativos.",
        realWorldUse: "Detecção de padrões de compra fraudulentos em cartões de crédito; identificação de acesso incomum a dados sensíveis em sistemas corporativos."
    },
    { 
        id: "reputation_kernel_module",
        title: "Reputation Kernel", 
        description: "Núcleo de cálculo e distribuição de reputação, considerado propriedade intelectual central da FoundLab, responsável pela lógica fundamental de avaliação reputacional.", 
        moduleType: "Core IP", 
        isMoat: true, 
        impactScore: 10, 
        usedInProductIds: ["nexusplatform", "scorelab"],
        purposeDefends: "A consistência, precisão e adaptabilidade do conceito de reputação em todo o ecossistema FoundLab.",
        riskIsolates: "Avaliações de reputação inconsistentes, modelos de score facilmente manipuláveis, e incapacidade de adaptar a noção de reputação a novos contextos.",
        activationCondition: "Fundamental para todos os cálculos de score e avaliações reputacionais dentro da plataforma.",
        realWorldUse: "Serve como base para todos os produtos FoundLab que dependem de uma métrica de reputação confiável e dinâmica."
    },
    { 
        id: "dynamic_feedback_loop_module",
        title: "Dynamic Feedback Loop", 
        description: "Ciclo de aprendizado contínuo com IA para refinar modelos de risco, flags e algoritmos de decisão com base em novos dados e resultados de vereditos.", 
        moduleType: "IA/ML", 
        isMoat: true, 
        impactScore: 9, 
        usedInProductIds: ["guardianai", "scorelab", "aistudio"],
        purposeDefends: "A melhoria contínua e a adaptabilidade dos modelos de IA da FoundLab frente a cenários de risco em constante evolução.",
        riskIsolates: "Degradação da performance dos modelos ao longo do tempo (model drift), obsolescência de regras de detecção, e incapacidade de aprender com novos padrões de fraude.",
        activationCondition: "Operação contínua, onde os resultados de decisões (confirmadas como fraude, falso positivo, etc.) e novos dados de ameaças retroalimentam os modelos.",
        realWorldUse: "Sistemas de detecção de fraude que se tornam mais inteligentes e precisos com o tempo, aprendendo com cada novo caso."
    },
    { id: "mirror_engine_module", title: "Mirror Engine", description: "Módulo que cria reflexos comportamentais e históricos paralelos para simulação e teste de cenários 'what-if'.", moduleType: "Analytics", impactScore: 7, usedInProductIds: ["aistudio"] },
    { id: "gas_monitor_module", title: "GasMonitor", description: "Monitora padrões de uso de gás (taxas de transação) em blockchains para detectar anomalias e comportamentos suspeitos.", moduleType: "Analytics", impactScore: 6, usedInProductIds: ["chainbridge"] },
    { id: "token_provenance_module", title: "Token Provenance", description: "Valida a origem e o histórico de tokens e ativos digitais, rastreando sua movimentação através de blockchains.", moduleType: "Validação", impactScore: 8, usedInProductIds: ["veritas", "chainbridge"] },
    { id: "avaliador_foundlab_module", title: "Avaliador FoundLab", description: "Score reputacional genérico e configurável baseado em múltiplas fontes internas e externas, servindo como um benchmark.", moduleType: "Motor", impactScore: 7 },
    { id: "flag_loader_module", title: "Flag Loader", description: "Carrega e aplica configurações de flags de risco dinamicamente, permitindo atualizações rápidas de regras de detecção.", moduleType: "Infraestrutura", impactScore: 5, usedInProductIds: ["guardianai", "aistudio"] },
    { id: "metadata_loader_module", title: "Metadata Loader", description: "Ingestão de dados auxiliares e metadados para análise contextual e enriquecimento de perfis de risco.", moduleType: "Dados", impactScore: 6, usedInProductIds: ["sigilmesh", "aistudio"] },
    { id: "score_snapshot_module", title: "Score Snapshot", description: "Registra snapshots periódicos de score e status de entidades para auditoria, análise de tendência e conformidade.", moduleType: "Dados", impactScore: 5 },
    { id: "watchdog_listener_module", title: "Watchdog Listener", description: "Listener para eventos anômalos e alertas críticos em tempo real, atuando como um sistema de alerta primário.", moduleType: "Segurança", impactScore: 8, usedInProductIds: ["guardianai", "nexusplatform"] },
    { id: "reputation_webhook_module", title: "Reputation Webhook", description: "Entrega de vereditos reputacionais e alertas via callback para sistemas externos e de parceiros.", moduleType: "API", impactScore: 6 },
    { id: "chainalysis_connector_module", title: "Chainalysis Connector", description: "Integração com API da Chainalysis para enriquecimento de dados de risco on-chain e análise de entidades.", moduleType: "Conector", impactScore: 7, usedInProductIds: ["veritas"] },
    { id: "bitquery_connector_module", title: "Bitquery Connector", description: "Consulta blockchain de alta performance via Bitquery para análise de transações, endereços e smart contracts.", moduleType: "Conector", impactScore: 7, usedInProductIds: ["veritas"] },
    { id: "open_finance_connector_module", title: "Open Finance Connector", description: "Integração com dados bancários e financeiros via APIs de Open Finance e Open Banking.", moduleType: "Conector", impactScore: 7, usedInProductIds: ["chainbridge"] },
    { id: "kyt_engine_module", title: "KYT Engine", description: "Motor de Know Your Transaction (KYT) com lógica reputacional embutida para análise profunda de transações financeiras.", moduleType: "Motor", impactScore: 8 },
    { id: "explorer_scanner_module", title: "Explorer Scanner", description: "Scanner de blocos, transações e histórico em tempo real para indexação, análise e monitoramento de blockchains.", moduleType: "Dados", impactScore: 7, usedInProductIds: ["veritas"] },
    { id: "badges_engine_module", title: "Badges Engine", description: "Geração de selos e badges reputacionais (digitais ou NFT) baseados em score, comportamento e credenciais verificadas.", moduleType: "Interface", impactScore: 6, usedInProductIds: ["sigilmesh"] },
    { id: "wallet_health_module", title: "Wallet Health", description: "Avaliação da saúde e confiabilidade de carteiras digitais com base em histórico de transações, interações e exposição a riscos.", moduleType: "Analytics", impactScore: 7 },
    { id: "reputation_mapper_module", title: "Reputation Mapper", description: "Mapeamento de conexões e relacionamentos reputacionais entre entidades, endereços e ativos digitais.", moduleType: "Analytics", impactScore: 7, usedInProductIds: ["sigilmesh"] },
    { id: "compliance_ruleset_module", title: "Compliance Ruleset", description: "Conjunto dinâmico e versionável de regras regulatórias e políticas internas para avaliação automatizada de conformidade.", moduleType: "Motor", impactScore: 8, usedInProductIds: ["veritas", "nexusplatform"] },
    { id: "flag_trigger_engine_module", title: "Flag Trigger Engine", description: "Ativador de flags de risco baseado em padrões contextuais complexos, correlação de eventos e regras condicionais.", moduleType: "Motor", impactScore: 7 },
    { id: "score_decay_manager_module", title: "Score Decay Manager", description: "Gerencia a perda ou manutenção de reputação ao longo do tempo (time decay), ajustando scores com base na relevância temporal dos eventos.", moduleType: "Motor", impactScore: 6 },
    { id: "malicious_pattern_db_module", title: "Malicious Pattern DB", description: "Base de dados atualizada de padrões maliciosos conhecidos (assinaturas de malware, endereços fraudulentos, etc.) para detecção rápida.", moduleType: "Dados", impactScore: 8, usedInProductIds: ["guardianai"] },
    { id: "reputational_sandbox_module", title: "Reputational Sandbox", description: "Ambiente de simulação e teste para avaliar o impacto de novas regras, flags ou modelos de score sem afetar a produção.", moduleType: "Infraestrutura", impactScore: 7, usedInProductIds: ["aistudio"] },
    { id: "reputation_archive_module", title: "Reputation Archive", description: "Armazena históricos de reputação, scores, flags e evidências de forma segura e auditável para conformidade e análise forense.", moduleType: "Dados", impactScore: 6, usedInProductIds: ["nexusplatform"] }
];
const allModuleTypes: ModuleType[] = Array.from(new Set(foundLabModules.map(m => m.moduleType))).sort();


// --- DOM ELEMENTS ---
const appContainer = document.getElementById('app-container') as HTMLElement;
const appContent = document.getElementById('app-content') as HTMLElement;

// Navigation buttons
let homeNavButton: HTMLButtonElement | null;
let demoNavButton: HTMLButtonElement | null;
let catalogNavButton: HTMLButtonElement | null;
let documentsNavButton: HTMLButtonElement | null; 

// Product Modal Elements
const productModalBackdrop = document.getElementById('product-modal-backdrop') as HTMLElement;
const productModalContentWrapper = document.getElementById('product-modal-content-wrapper') as HTMLElement;
const productModalContentEl = document.getElementById('product-modal-content') as HTMLElement;
const productModalCloseButtonTop = document.getElementById('product-modal-close-button-top') as HTMLButtonElement;

// Core Module Detail Modal Elements
const coreModuleModalBackdrop = document.getElementById('core-module-modal-backdrop') as HTMLElement;
const coreModuleModalContentWrapper = document.getElementById('core-module-modal-content-wrapper') as HTMLElement;
const coreModuleModalContentEl = document.getElementById('core-module-modal-content') as HTMLElement;
const coreModuleModalCloseButtonTop = document.getElementById('core-module-modal-close-button-top') as HTMLButtonElement;

// Impact Comparison Modal Elements
let impactModalBackdrop: HTMLElement | null;
let impactModalContentEl: HTMLElement | null;
let impactModalCloseButtonTop: HTMLButtonElement | null;


const bootScreen = document.getElementById('boot-screen') as HTMLElement;
const bootMessage = document.getElementById('boot-message') as HTMLElement;

const decisionLoaderOverlay = document.getElementById('decision-loader-overlay') as HTMLElement;
const decisionLoaderProgressBar = decisionLoaderOverlay.querySelector('.progress-bar') as HTMLElement | null;

const alertSound = document.getElementById('alert-sound') as HTMLAudioElement | null;


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    homeNavButton = document.getElementById('nav-home-button') as HTMLButtonElement;
    demoNavButton = document.getElementById('nav-demo-button') as HTMLButtonElement;
    catalogNavButton = document.getElementById('nav-catalog-button') as HTMLButtonElement;
    documentsNavButton = document.getElementById('nav-documents-button') as HTMLButtonElement; 

    impactModalBackdrop = document.getElementById('impact-modal-backdrop') as HTMLElement;
    impactModalContentEl = document.getElementById('impact-modal-content') as HTMLElement;
    impactModalCloseButtonTop = document.getElementById('impact-modal-close-button-top') as HTMLButtonElement;


    const bootMessages = ["Inicializando FoundLab Core...", "Carregando Motor de Decisão Segura...", "Estabelecendo Conexões Seguras...", "Plataforma Quase Pronta..."];
    let msgIdx = 0;
    const intervalId = setInterval(() => {
        msgIdx = (msgIdx + 1) % bootMessages.length;
        bootMessage.textContent = bootMessages[msgIdx];
    }, BOOT_DURATION / bootMessages.length);

    setTimeout(() => {
        clearInterval(intervalId);
        bootScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        setupNavigationButtons();
        setupProductModalCloseActions();
        setupCoreModuleModalCloseActions();
        setupImpactModalCloseActions();
        loadDecisionAuditLogFromStorage();
        renderApp(); // Initial render will be landing page
    }, BOOT_DURATION);
});

function setupNavigationButtons(): void {
    homeNavButton?.addEventListener('click', () => {
        currentMode = 'landing';
        updateActiveButtonStyles();
        renderApp();
    });
    demoNavButton?.addEventListener('click', () => {
        currentMode = 'simulator';
        updateActiveButtonStyles();
        renderApp();
    });
    catalogNavButton?.addEventListener('click', () => {
        currentMode = 'catalog';
        updateActiveButtonStyles();
        renderApp();
    });
    documentsNavButton?.addEventListener('click', () => { 
        currentMode = 'documents';
        updateActiveButtonStyles();
        renderApp();
    });
}

function updateActiveButtonStyles(): void {
    [homeNavButton, demoNavButton, catalogNavButton, documentsNavButton].forEach(button => { 
        button?.classList.remove('active');
    });

    switch (currentMode) {
        case 'landing':
            homeNavButton?.classList.add('active');
            break;
        case 'simulator':
            demoNavButton?.classList.add('active');
            break;
        case 'catalog':
            catalogNavButton?.classList.add('active');
            break;
        case 'documents':
            documentsNavButton?.classList.add('active');
            break;
    }
}

// --- CORE RENDERING ---
function renderApp(): void {
    clearAppContent();
    stopSimulation(); 
    degradedModules = []; 
    lastBlockContextForImpactView = null; 
    criticalTimelineEvents = [];

    // activeProductDemoName is managed within each mode's rendering or initialization
    if (currentMode !== 'simulator') {
        activeProductDemoName = null;
    }

    if (currentMode === 'landing') {
        renderLandingPageMode();
    } else if (currentMode === 'simulator') {
        // activeProductDemoName might be pre-set if coming from catalog "Ver em Ação"
        // or a CTA on the landing page that directly loads a product demo scenario.
        // If just clicking "DEMO" nav, it will be null or default.
        renderSimulatorMode(); 
    } else if (currentMode === 'catalog') {
        renderCatalogMode();
    } else if (currentMode === 'documents') { 
        renderDocumentsMode();
    }
    updateActiveButtonStyles(); // Ensure correct nav button is active after render
}

function clearAppContent(): void {
    appContent.innerHTML = '';
}


// --- LANDING PAGE MODE ---
function renderLandingPageMode(): void {
    appContent.innerHTML = `
        <div class="landing-page-container">
            <section class="hero-section">
                <div class="hero-content">
                    <svg class="hero-logo-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z M50 10 L50 50 L10 30 M50 50 L10 70 M50 50 L90 30 M50 50 L90 70" stroke-width="3"/></svg>
                    <h1>FoundLab Nexus: Inteligência Reputacional. Decisões de Confiança.</h1>
                    <p class="subtitle">Orquestramos a confiança digital com precisão e velocidade, transformando dados em blindagem infra-level para operações críticas.</p>
                    <div class="hero-ctas">
                        <button id="lp-cta-simulador" class="cta-button primary-cta large-cta">Explorar Demonstração Interativa</button>
                        <button id="lp-cta-solucoes" class="cta-button secondary-cta large-cta">Conhecer Nossas Soluções</button>
                    </div>
                </div>
                <div class="hero-visual-placeholder">
                    <span>[Visual Abstrato de Conectividade e Segurança]</span>
                </div>
            </section>

            <section class="platform-section">
                <h2>A Plataforma FoundLab Nexus</h2>
                <div class="platform-pillars">
                    <div class="pillar">
                        <div class="pillar-icon-placeholder">[P]</div>
                        <h3>Precisão Preditiva</h3>
                        <p>Análises avançadas para antecipar riscos complexos antes que impactem seus negócios.</p>
                    </div>
                    <div class="pillar">
                        <div class="pillar-icon-placeholder">[D]</div>
                        <h3>Decisões Automatizadas</h3>
                        <p>Respostas em tempo real, orquestradas com inteligência para máxima eficiência operacional.</p>
                    </div>
                    <div class="pillar">
                        <div class="pillar-icon-placeholder">[C]</div>
                        <h3>Conformidade Robusta</h3>
                        <p>Navegue pela complexidade regulatória com segurança e mantenha a integridade em todas as operações.</p>
                    </div>
                    <div class="pillar">
                        <div class="pillar-icon-placeholder">[A]</div>
                        <h3>Arquitetura Integrada</h3>
                        <p>Visão unificada do risco em todo o ecossistema, potencializada por uma infraestrutura modular e escalável.</p>
                    </div>
                </div>
            </section>

            <section class="solutions-teaser-section">
                <h2>Soluções que Impulsionam a Confiança</h2>
                <div class="solutions-grid">
                    ${productCatalog.slice(0, 3).map(product => `
                        <div class="solution-teaser-card" data-product-id="${product.id}">
                            <h4>${product.name}</h4>
                            <p>${product.shortDescription.substring(0, 100)}...</p>
                            <button class="cta-button tertiary-cta product-teaser-cta" data-product-id="${product.id}">Saiba Mais</button>
                        </div>
                    `).join('')}
                </div>
                 <div class="all-solutions-link">
                    <button id="lp-cta-all-solutions" class="cta-button secondary-cta">Ver todas as soluções</button>
                </div>
            </section>

            <section class="why-foundlab-section">
                <h2>A Vantagem FoundLab</h2>
                <ul>
                    <li>Tecnologia Proprietária de Vanguarda e IA Explicável.</li>
                    <li>Inteligência Contextual em Tempo Real para Decisões Críticas.</li>
                    <li>Segurança e Conformidade by Design, Prontas para o Futuro.</li>
                    <li>Parceria Estratégica para Inovação Contínua e Suporte Especializado.</li>
                </ul>
            </section>

            <section class="next-steps-section">
                <h2>Transforme Sua Estratégia de Risco.</h2>
                <p>Descubra como a FoundLab Nexus pode fortalecer suas operações, proteger seus ativos e habilitar novos modelos de negócio com confiança.</p>
                <div class="hero-ctas">
                     <button id="lp-cta-simulador-bottom" class="cta-button primary-cta large-cta">Explorar Demonstração Interativa</button>
                     <button id="lp-cta-contato" class="cta-button secondary-cta large-cta">Fale com um Especialista (Simulado)</button>
                </div>
            </section>
        </div>
    `;

    document.getElementById('lp-cta-simulador')?.addEventListener('click', () => {
        currentMode = 'simulator';
        renderApp();
    });
    document.getElementById('lp-cta-simulador-bottom')?.addEventListener('click', () => {
        currentMode = 'simulator';
        renderApp();
    });
    document.getElementById('lp-cta-solucoes')?.addEventListener('click', () => {
        currentMode = 'catalog';
        renderApp();
    });
    document.getElementById('lp-cta-all-solutions')?.addEventListener('click', () => {
        currentMode = 'catalog';
        renderApp();
    });
     document.getElementById('lp-cta-contato')?.addEventListener('click', () => {
        alert('Funcionalidade de contato simulada. Em uma aplicação real, isso levaria a um formulário ou informações de contato.');
    });

    const teaserCards = document.querySelectorAll('.solution-teaser-card');
    teaserCards.forEach(card => {
        card.addEventListener('click', (event) => {
            const target = event.target as HTMLElement;
            const cardElement = target.closest('.solution-teaser-card') as HTMLElement;
            if (cardElement && cardElement.dataset.productId) {
                const productId = cardElement.dataset.productId;
                const product = productCatalog.find(p => p.id === productId);
                if (product) {
                    currentMode = 'catalog'; // Go to catalog first
                    renderApp(); // Render catalog
                    setTimeout(() => showProductModal(product), 0); // Then show modal for specific product
                }
            }
        });
    });
}


// --- TIMELINE FUNCTIONS ---
function addTimelineEvent(event: Omit<TimelineEvent, 'id' | 'timestamp'>): void {
    const newEvent: TimelineEvent = {
        ...event,
        id: `timeline-event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date()
    };
    criticalTimelineEvents.push(newEvent);
    criticalTimelineEvents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Keep sorted
    if (criticalTimelineEvents.length > 50) { // Limit timeline events
        criticalTimelineEvents.shift();
    }
    renderTimeline();
}

function renderTimeline(): void {
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;

    if (criticalTimelineEvents.length === 0) {
        timelineContainer.innerHTML = '<p class="timeline-empty-message">Nenhum evento crítico na linha do tempo.</p>';
        return;
    }

    const firstEventTime = criticalTimelineEvents[0].timestamp.getTime();
    const lastEventTime = criticalTimelineEvents[criticalTimelineEvents.length - 1].timestamp.getTime();
    const totalDuration = Math.max(1, lastEventTime - firstEventTime); 

    timelineContainer.innerHTML = `
        <div class="timeline-track">
            ${criticalTimelineEvents.map(event => {
                const relativePosition = totalDuration > 0 ? ((event.timestamp.getTime() - firstEventTime) / totalDuration) * 100 : 0;
                let iconText = event.title; // Use title directly as icon text
                let fullDescription = event.description || event.title;

                // For corporate style, use text or simple unicode instead of emojis
                switch (event.type) {
                    case 'score_change':
                        iconText = (event.data?.scoreChange ?? 0) > 0 ? '△+' : '△-';
                        fullDescription = `Score ${event.title}: ${(event.data?.scoreChange ?? 0) > 0 ? '+' : ''}${event.data?.scoreChange} (Atual: ${event.data?.value})`;
                        break;
                    case 'critical_flag':
                        iconText = '❗'; // Exclamation mark for critical
                        fullDescription = `Flag Crítica: ${event.data?.flagName}`;
                        break;
                    case 'block_decision':
                        iconText = '■'; // Square for block
                        break;
                    case 'module_toggle':
                        iconText = event.data?.moduleState === 'degraded' ? 'MOD ▼' : 'MOD ▲'; // Text for module state
                        fullDescription = `Módulo ${event.data?.moduleName} ${event.data?.moduleState === 'degraded' ? 'DEGRADADO' : 'RESTAURADO'}`;
                        break;
                    case 'scenario_start':
                        iconText = '▶'; // Play icon
                        break;
                    case 'product_milestone':
                        iconText = '🔷'; // Diamond for milestone
                        break;
                    default:
                        iconText = '•'; // Default dot
                }
                return `
                    <div class="timeline-event type-${event.type}" 
                         style="left: ${Math.min(100, Math.max(0, relativePosition))}%;" 
                         title="${fullDescription} (${event.timestamp.toLocaleTimeString()})"
                         data-event-id="${event.id}"
                         role="button"
                         tabindex="0"
                         aria-label="${fullDescription}">
                        <span class="timeline-event-icon">${iconText}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    setupTimelineEventListeners();
}

function setupTimelineEventListeners(): void {
    const timelineContainer = document.getElementById('timeline-container');
    timelineContainer?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const eventElement = target.closest('.timeline-event') as HTMLElement;
        if (eventElement && eventElement.dataset.eventId) {
            handleTimelineEventClick(eventElement.dataset.eventId);
        }
    });
}

function handleTimelineEventClick(eventId: string): void {
    const event = criticalTimelineEvents.find(ev => ev.id === eventId);
    if (event) {
        addLogEntry(`Evento da Linha do Tempo: ${event.title} (${event.type}) - ${event.description || ''}`, 'system', true);
        console.log("Timeline Event Clicked:", event);
        document.querySelectorAll('.timeline-event.highlighted').forEach(el => el.classList.remove('highlighted'));
        const eventEl = document.querySelector(`.timeline-event[data-event-id="${eventId}"]`);
        eventEl?.classList.add('highlighted');
        setTimeout(() => eventEl?.classList.remove('highlighted'), 1500); // Shorter highlight
    }
}


// --- SIMULATOR MODE (DECISION FLOW) ---
function renderSimulatorMode(
    scenarioIdToInitialize?: string, 
    initialScoreFromProof?: number, 
    initialFlagTypesFromProof?: FlagType[],
    walletAddressFromProof?: string
): void {
    let productDemoIndicatorHTML = '';
    if (activeProductDemoName) { // This uses the state variable `activeProductDemoName`
        productDemoIndicatorHTML = `<div class="active-product-demo-indicator">Demonstração Ativa: <strong>${activeProductDemoName}</strong></div>`;
    }

    appContent.innerHTML = `
        <div class="content-title">FoundLab Nexus - DEMO Interativa</div>
        ${productDemoIndicatorHTML}
        <div class="simulator-config-area" id="simulator-config-area">
            <h3>Configurar Cenário de Simulação</h3>
            <div class="scenario-input-group">
                <label for="wallet-address-input-sim" class="scenario-label visually-hidden">Endereço de Carteira Simulado:</label>
                <input type="text" id="wallet-address-input-sim" placeholder="Ex: 0xRiskWallet ou nome_carteira_ficticia" aria-label="Endereço de Carteira Simulado">
                <button id="analyze-wallet-button-sim" class="cta-button primary-cta">Analisar e Iniciar</button>
            </div>
            <div id="scenario-status-sim" class="scenario-status">
                <p>Ou inicie a simulação padrão (automática).</p>
            </div>
             <button id="start-default-simulation-button" class="cta-button secondary-cta">Iniciar Simulação Padrão</button>
        </div>

        <div class="simulator-layout">
            <div class="kpi-bar" id="kpi-bar"></div>
            <div class="decision-history-panel">
                <h3>Histórico de Decisões Auditadas</h3>
                <div id="decision-audit-log-list"><p class="no-items-placeholder">Nenhuma decisão auditada ainda.</p></div>
            </div>
            
            <div class="main-simulation-area">
                 <div class="score-and-actions-container">
                    <div class="score-panel" id="score-panel"></div>
                    <div class="decision-actions-wrapper">
                        <div class="decision-actions" id="decision-actions">
                            <button class="decision-button authorize" data-action="authorize" aria-label="Autorizar Transação">Autorizar</button>
                            <button class="decision-button review" data-action="review" aria-label="Revisar Transação">Revisar</button>
                            <button class="decision-button block" data-action="block" aria-label="Bloquear Transação">Bloquear</button>
                        </div>
                        <div id="impact-button-area"></div>
                    </div>
                </div>
                 <div class="system-health-panel-container" id="system-health-panel-container">
                    <!-- System Health Panel will be rendered here -->
                </div>
            </div>

            <div class="flags-and-logs-container">
                <div class="flags-container" id="flags-container">
                    <h3>Flags de Risco Ativas</h3>
                    <div id="flags-list"></div>
                </div>
                <div class="logs-container" id="logs-container">
                    <h3>Logs e Histórico de Eventos</h3>
                    <div id="logs-list"></div>
                </div>
            </div>
            <div id="timeline-container-wrapper" class="timeline-container-wrapper">
                <h4>Linha do Tempo de Eventos Críticos</h4>
                <div id="timeline-container"></div>
            </div>
        </div>
    `;
    
    document.getElementById('analyze-wallet-button-sim')?.addEventListener('click', () => {
        if (!isSettingUpScenario) {
            handleSetupScenarioFromInput();
        }
    });
    document.getElementById('start-default-simulation-button')?.addEventListener('click', () => {
        if (!isSettingUpScenario && !simulationIntervalId) { 
            initializeScenario('default_start');
        } else if (simulationIntervalId) {
            addLogEntry("Simulação já está em execução.", "info");
        }
    });


    setupDecisionButtonListeners();
    renderDecisionAuditLog(); 
    renderSystemHealthPanel();
    renderImpactModalButtonArea();
    renderTimeline(); 

    const scenarioToRun = scenarioIdToInitialize || 'default_start'; 
    if (initialScoreFromProof !== undefined && initialFlagTypesFromProof) {
        initializeScenario(scenarioToRun, initialScoreFromProof, initialFlagTypesFromProof, walletAddressFromProof);
    } else if (scenarioIdToInitialize && scenarioIdToInitialize !== 'default_start') {
        initializeScenario(scenarioIdToInitialize);
    } else {
        // If not initializing a specific scenario here, ensure activeProductDemoName is cleared if it wasn't already.
        // This path is usually for initial load or manual navigation to simulator tab.
        if (!scenarioIdToInitialize || scenarioIdToInitialize === 'default_start') activeProductDemoName = null; 
        updateAllSimulatorDisplays(currentScore); 
        addLogEntry("Simulador pronto. Configure um cenário ou inicie a simulação padrão.", "system");
        addTimelineEvent({type: 'scenario_start', title: 'Simulador Pronto'});
    }
}

function initializeScenario(
    scenarioId: string, 
    initialScoreFromConfig?: number, 
    initialFlagTypesFromConfig?: FlagType[],
    walletAddressFromConfig?: string
): void {
    const scoreBeforeScenarioUpdate = currentScore;
    activeFlags = []; 
    degradedModules = []; 
    logEntries = []; 
    criticalTimelineEvents = []; 
    lastBlockContextForImpactView = null;
    // activeProductDemoName is set *before* calling renderSimulatorMode for product demos,
    // or set to null here for custom/default scenarios.

    const productForScenario = productCatalog.find(p => p.scenarioId === scenarioId);
    let scenarioSpecificLogPreamble = "";

    // No direct DOM manipulation for active-product-demo-indicator here.
    // It's handled by renderSimulatorMode based on activeProductDemoName state.

    if (productForScenario) {
        // activeProductDemoName should have been set by the caller (e.g. catalog "Ver em Ação")
        // If not, it means this was called directly, so set it.
        if (!activeProductDemoName) activeProductDemoName = productForScenario.name;
        scenarioSpecificLogPreamble = `Demonstração do ${productForScenario.name}: `;
        addTimelineEvent({ type: 'product_milestone', title: `DEMO: ${productForScenario.name.substring(0,10)}`, description: `Cenário ${scenarioId}`});
    } else {
        activeProductDemoName = null; // Ensure it's null for non-product scenarios
        scenarioSpecificLogPreamble = "Cenário Predefinido: ";
        addTimelineEvent({ type: 'scenario_start', title: `CENÁRIO: ${scenarioId.substring(0,15)}`});
    }


    if (initialScoreFromConfig !== undefined && initialFlagTypesFromConfig) {
        currentScore = initialScoreFromConfig;
        activeProductDemoName = null; // Custom scenario, not a product demo

        addLogEntry(`Simulação personalizada iniciada para a carteira: ${walletAddressFromConfig || 'Desconhecida'}. Score inicial: ${currentScore}.`, 'system', true);
        addTimelineEvent({type: 'scenario_start', title: `CARTEIRA: ${(walletAddressFromConfig || 'Custom').substring(0,10)}`, data: { value: currentScore }});

        initialFlagTypesFromConfig.forEach(flagType => {
            addNewFlag(flagType, `custom_scenario_${scenarioId}`, false); 
        });
        updateAllSimulatorDisplays(scoreBeforeScenarioUpdate);
        renderSystemHealthPanel();
        renderImpactModalButtonArea();
        startSimulation(true); 
    } else {
        addLogEntry(`Iniciando ${scenarioSpecificLogPreamble}${scenarioId}`, 'system', true);
        currentScore = INITIAL_SCORE - Math.floor(Math.random() * 50); 

        switch (scenarioId) {
            case 'scorelab_onboarding_risk':
                addLogEntry(`${scenarioSpecificLogPreamble}Análise de risco em onboarding de nova carteira.`, 'system', true);
                currentScore = 750; 
                addNewFlagByName('New Account High Activity', scenarioId, 500);
                addNewFlagByName('Unusual Transaction Pattern', scenarioId, 2500);
                addNewFlagByName('High Volume Anomaly', scenarioId, 4500);
                break;
            case 'sigilmesh_identity_verification':
                addLogEntry(`${scenarioSpecificLogPreamble}Verificação de identidade com credenciais NFT e possíveis anomalias.`, 'system', true);
                currentScore = 800;
                addNewFlagByName('Identity Mismatch', scenarioId, 1000);
                addNewFlagByName('Biometric Anomaly', scenarioId, 3000);
                break;
            case 'veritas_trusted_wallet_contested':
                addLogEntry(`${scenarioSpecificLogPreamble}Carteira inicialmente confiável apresenta atividades suspeitas, contestando seu status.`, 'system', true);
                currentScore = 920; 
                 setTimeout(() => { 
                    addNewFlagByName('Mixer Usage Detected', scenarioId, 0); 
                    addNewFlagByName('Funds from Known Hack', scenarioId, 1500);
                    addNewFlagByName('Smart Contract Vulnerability Detected', scenarioId, 2500);
                }, 5000);
                break;
            case 'guardianai_system_anomaly':
                addLogEntry(`${scenarioSpecificLogPreamble}Detecção proativa de anomalias e ameaças à segurança do sistema.`, 'system', true);
                currentScore = 880;
                addNewFlagByName('Anomalous System Access', scenarioId, 1000);
                addNewFlagByName('Potential Phishing Attempt', scenarioId, 3500);
                addNewFlagByName('Data Exfiltration Attempt', scenarioId, 5000);
                break;
            case 'chainbridge_pix_crypto_tx':
                addLogEntry(`${scenarioSpecificLogPreamble}Análise de risco em transação entre sistema Pix e criptoativos.`, 'system', true);
                currentScore = 820;
                addNewFlagByName('High Risk Source of Funds (Pix)', scenarioId, 1000);
                addNewFlagByName('Unverified Crypto Wallet', scenarioId, 2500);
                addNewFlagByName('Large Cross-Border Transaction', scenarioId, 4000);
                break;
            case 'aistudio_model_simulation':
                addLogEntry(`${scenarioSpecificLogPreamble}Simulação e validação de modelo de risco customizado.`, 'system', true);
                currentScore = 900;
                addNewFlagByName('Model Overfitting Alert', scenarioId, 1500);
                addNewFlagByName('Data Skew Detected in Simulation', scenarioId, 3000);
                addNewFlagByName('Inconsistent Flag Logic', scenarioId, 4500);
                break;
            case 'sybil_attack_detected': 
                currentScore = 600; 
                 addLogEntry("ALERTA DE CENÁRIO CRÍTICO: Padrão de Ataque Sybil Detectado!", 'error', true);
                addNewFlagByName('Sybil Attack Pattern Detected', scenarioId, 500);
                setTimeout(() => {
                    const sybilImpactScore = currentScore;
                    currentScore = Math.max(0, currentScore - 300); 
                    updateScorePanel(currentScore, sybilImpactScore);
                    addLogEntry("IMPACTO CRÍTICO: Ataque Sybil confirmado. Score severamente reduzido.", 'error', true);
                    addTimelineEvent({ type: 'score_change', title: 'Ataque Sybil', data: { scoreChange: currentScore - sybilImpactScore, value: currentScore } });
                     const decisionActions = document.getElementById('decision-actions');
                    if (decisionActions) {
                        decisionActions.querySelector('.block')?.classList.add('recommended-action-pulse');
                    }
                }, 1000);
                break;
            case 'nexus_overview_demo': 
                addLogEntry(`${scenarioSpecificLogPreamble}Orquestração central e correlação de riscos entre múltiplos vetores.`, 'system', true);
                currentScore = INITIAL_SCORE - 20; 
                addNewFlagByName('High Volume Anomaly', scenarioId, 1000);
                addNewFlagByName('Cross-Product Risk Correlation', scenarioId, 2500);
                addNewFlagByName('Anomalous System Access', scenarioId, 4000);
                break;
            case 'default_start':
            default: 
                currentScore = INITIAL_SCORE;
                activeProductDemoName = null; // Explicitly null for default

                addLogEntry(scenarioId === 'default_start' ? "Simulação padrão iniciada." : `Cenário desconhecido "${scenarioId}", iniciando simulação padrão.`, 'system', true);
                addTimelineEvent({type: 'scenario_start', title: 'Padrão', data: { value: currentScore }});
                addNewFlagByName('High Volume Anomaly', 'default_start', 1000);
                addNewFlagByName('Anomalous System Access', 'default_start', 4000);
                break;
        }

        if (productForScenario?.relatedFlags) {
            productForScenario.relatedFlags.forEach((flagName, index) => {
                if (!activeFlags.some(af => af.name === flagName)) { 
                    const flagType = flagTypes.find(ft => ft.name === flagName);
                    if (flagType && (flagType.severity !== 'critical' || !isModuleActive("Dynamic Flag Council (DFC)"))) {
                         addNewFlagByName(flagName, scenarioId, 6000 + index * 1500); 
                    }
                }
            });
        }
        updateAllSimulatorDisplays(scoreBeforeScenarioUpdate);
        renderSystemHealthPanel();
        renderImpactModalButtonArea();
        startSimulation(scenarioId !== 'default_start'); 
    }
    renderTimeline(); 
}


async function handleSetupScenarioFromInput(): Promise<void> {
    isSettingUpScenario = true;
    lastBlockContextForImpactView = null; 
    activeProductDemoName = null; // Custom scenario from input is not a product demo
    const statusContainer = document.getElementById('scenario-status-sim');
    const walletInputEl = document.getElementById('wallet-address-input-sim') as HTMLInputElement;
    const analyzeButton = document.getElementById('analyze-wallet-button-sim') as HTMLButtonElement;
    const defaultStartButton = document.getElementById('start-default-simulation-button') as HTMLButtonElement;

    // No direct DOM manipulation for active-product-demo-indicator here.

    if (!statusContainer || !walletInputEl || !analyzeButton || !defaultStartButton) {
        isSettingUpScenario = false;
        return;
    }

    const walletAddress = walletInputEl.value.trim();

    if (!walletAddress) {
        statusContainer.innerHTML = '<p class="error-message">Por favor, insira um endereço de carteira simulada.</p>';
        isSettingUpScenario = false;
        return;
    }

    statusContainer.innerHTML = `
        <div class="scenario-loading">
            <div class="spinner"></div>
            <p>Analisando e preparando simulação para: <strong>${walletAddress}</strong>...</p>
        </div>`;
    analyzeButton.disabled = true;
    defaultStartButton.disabled = true;
    analyzeButton.textContent = 'Processando...';

    await new Promise(resolve => setTimeout(resolve, SCENARIO_SETUP_PROCESSING_TIME));

    let initialScore = 0;
    for (let i = 0; i < walletAddress.length; i++) {
        initialScore = (initialScore + walletAddress.charCodeAt(i) * (i + 13)) % 1001;
    }
    initialScore = Math.max(50, Math.min(990, initialScore)); 

    const initialFlagTypesForSimulator: FlagType[] = [];
    if (initialScore < 350) { 
        const criticalFlags = flagTypes.filter(ft => ft.severity === 'critical').sort(() => 0.5 - Math.random());
        const highFlags = flagTypes.filter(ft => ft.severity === 'high').sort(() => 0.5 - Math.random());
        if (criticalFlags.length > 0) initialFlagTypesForSimulator.push(criticalFlags[0]);
        if (highFlags.length > 0 && initialFlagTypesForSimulator.length < 2) initialFlagTypesForSimulator.push(highFlags[0]);
        if (highFlags.length > 1 && initialFlagTypesForSimulator.length < 3) initialFlagTypesForSimulator.push(highFlags[1]);
    } else if (initialScore < 650) { 
        const mediumFlags = flagTypes.filter(ft => ft.severity === 'medium').sort(() => 0.5 - Math.random());
        if (mediumFlags.length > 0) initialFlagTypesForSimulator.push(mediumFlags[0]);
        if (mediumFlags.length > 1 && initialFlagTypesForSimulator.length < 2) initialFlagTypesForSimulator.push(mediumFlags[1]);
    } else if (initialScore < 850) { 
        const lowFlags = flagTypes.filter(ft => ft.severity === 'low' || ft.severity === 'info').sort(() => 0.5 - Math.random());
        if (lowFlags.length > 0) initialFlagTypesForSimulator.push(lowFlags[0]);
    }
    
    if (initialScore < 850 && initialFlagTypesForSimulator.length === 0) {
        const defaultFlag = flagTypes.find(f => f.name === 'Low Activity Wallet') || flagTypes.find(f => f.severity === 'info');
        if (defaultFlag) initialFlagTypesForSimulator.push(defaultFlag);
    }
     if (initialScore >= 850 && initialFlagTypesForSimulator.length === 0) {
        const positiveFlag = flagTypes.find(f => f.name === 'Low Activity Wallet'); 
        if (positiveFlag) initialFlagTypesForSimulator.push(positiveFlag);
    }

    const scenarioIdForCustom = `custom_wallet_${walletAddress.replace(/\W/g, '_').slice(0, 20)}`;
    
    initializeScenario(scenarioIdForCustom, initialScore, initialFlagTypesForSimulator, walletAddress);
    
    statusContainer.innerHTML = `<p>Simulação configurada para <strong>${walletAddress}</strong>. Observando...</p>`;
    analyzeButton.disabled = false;
    defaultStartButton.disabled = false;
    analyzeButton.textContent = 'Analisar e Iniciar';
    isSettingUpScenario = false; 
}


function addNewFlagByName(flagName: string, scenarioId?: string, delay: number = 0): void {
    const flagType = flagTypes.find(ft => ft.name === flagName);
    if (flagType) {
        setTimeout(() => {
            if (!activeFlags.some(f => f.name === flagType.name && f.scenarioId === scenarioId)) {
                 addNewFlag(flagType, scenarioId, true); 
            }
        }, delay);
    } else {
        console.warn(`Tipo de flag "${flagName}" não encontrado para o cenário.`);
    }
}

// --- SYSTEM HEALTH PANEL ---
function renderSystemHealthPanel(): void {
    const panelContainer = document.getElementById('system-health-panel-container');
    if (!panelContainer) return;

    panelContainer.innerHTML = `
        <div class="system-health-panel">
            <h3>Integridade dos Módulos Core</h3>
            <div id="system-health-modules-list">
                ${toggleableCoreModules.map(module => `
                    <div class="system-health-module-item">
                        <label for="${module.id}" class="module-toggle-label" title="${module.description}">
                            <input type="checkbox" id="${module.id}" data-module-title="${module.title}" ${isModuleActive(module.title) ? 'checked' : ''} role="switch" aria-checked="${isModuleActive(module.title)}">
                            <span class="module-name">${module.title}</span>
                        </label>
                    </div>
                `).join('')}
            </div>
            <p class="panel-note">Desabilitar módulos impactará a simulação.</p>
        </div>
    `;
    setupModuleToggleListeners();
}

function isModuleActive(moduleTitle: string): boolean {
    return !degradedModules.includes(moduleTitle);
}

function setupModuleToggleListeners(): void {
    const moduleList = document.getElementById('system-health-modules-list');
    if (moduleList) {
        moduleList.addEventListener('change', (event: Event) => {
            const target = event.target as HTMLInputElement;
            if (target && target.type === 'checkbox' && target.dataset.moduleTitle) {
                const moduleTitle = target.dataset.moduleTitle;
                toggleModuleState(moduleTitle);
            }
        });
    }
}

function toggleModuleState(moduleTitle: string): void {
    const index = degradedModules.indexOf(moduleTitle);
    const checkbox = document.getElementById(toggleableCoreModules.find(m => m.title === moduleTitle)!.id) as HTMLInputElement | null;

    if (index > -1) {
        degradedModules.splice(index, 1);
        addLogEntry(`Módulo ${moduleTitle} restaurado para operação normal.`, 'system', true);
        addTimelineEvent({type: 'module_toggle', title: `MOD: ${moduleTitle.substring(0,10)} ▲`, data: { moduleName: moduleTitle, moduleState: 'active' }});
        if(checkbox) checkbox.setAttribute('aria-checked', 'true');
    } else {
        degradedModules.push(moduleTitle);
        addLogEntry(`Módulo ${moduleTitle} DEGRADADO. Funcionalidade da simulação afetada.`, 'warning', true);
        addTimelineEvent({type: 'module_toggle', title: `MOD: ${moduleTitle.substring(0,10)} ▼`, data: { moduleName: moduleTitle, moduleState: 'degraded' }});
        if(checkbox) checkbox.setAttribute('aria-checked', 'false');
    }
    const panelContainer = document.getElementById('system-health-panel-container');
    if (panelContainer) {
       renderSystemHealthPanel(); 
    } else {
        updateAllSimulatorDisplays(currentScore); 
    }
}


function startSimulation(isScenarioRunning: boolean = false): void {
    stopSimulation(); 

    addLogEntry("Motor de simulação iniciado.", 'info');
    updateAllSimulatorDisplays(currentScore); 

    simulationIntervalId = window.setInterval(() => {
        const oldScoreVal = currentScore;
        let scoreChange = Math.floor(Math.random() * 41) - 20; 

        if (!isModuleActive("ScoreLab Core")) {
            scoreChange = Math.floor(Math.random() * 71) - 35; 
            if (scoreChange > 0) scoreChange *= 0.5; 
            addLogEntry("ScoreLab Core DEGRADADO: Volatilidade do score aumentada, recuperação dificultada.", 'warning');
        }

        if (currentScore < 400) scoreChange += Math.floor(Math.random() * 10); 
        else if (currentScore > 950) scoreChange -= Math.floor(Math.random() * 5); 

        currentScore += scoreChange;
        currentScore = Math.max(0, Math.min(1000, currentScore)); 

        scoreHistory.push(currentScore);
        if (scoreHistory.length > MAX_SCORE_HISTORY) scoreHistory.shift();

        addLogEntry(`Score alterado: ${oldScoreVal} -> ${currentScore} (Δ ${currentScore - oldScoreVal})`, 'info');
        updateScorePanel(currentScore, oldScoreVal);
        updateKpis();
    }, SCORE_UPDATE_INTERVAL);

    if (!isScenarioRunning) { 
        flagGenerationIntervalId = window.setInterval(() => {
            let maxActiveFlags = 5;
            let filterCritical = true;

            if (!isModuleActive("Dynamic Flag Council (DFC)")) {
                maxActiveFlags = 8; 
                filterCritical = false; 
                 addLogEntry("DFC DEGRADADO: Limite de flags aumentado, filtragem de severidade reduzida.", 'warning');
            }
            
            if (activeFlags.length < maxActiveFlags) { 
                let potentialFlagTypes = [...flagTypes];
                if (filterCritical) {
                    potentialFlagTypes = flagTypes.filter(ft => ft.severity !== 'critical');
                }
                
                if(!isModuleActive("Anomaly Detector")) {
                    potentialFlagTypes = potentialFlagTypes.filter(ft => 
                        !['High Volume Anomaly', 'Unusual Transaction Pattern', 'Velocity Anomaly'].includes(ft.name)
                    );
                    addLogEntry("Anomaly Detector DEGRADADO: Capacidade de detectar flags baseadas em anomalias reduzida.", 'warning');
                }

                if (potentialFlagTypes.length > 0) {
                    const randomFlagType = potentialFlagTypes[Math.floor(Math.random() * potentialFlagTypes.length)];
                    addNewFlag(randomFlagType, undefined, true); 
                }
            }
        }, FLAG_GENERATION_INTERVAL);
    }
}

function stopSimulation(): void {
    if (simulationIntervalId) {
        clearInterval(simulationIntervalId);
        simulationIntervalId = null;
    }
    if (flagGenerationIntervalId) {
        clearInterval(flagGenerationIntervalId);
        flagGenerationIntervalId = null;
    }
}

function updateAllSimulatorDisplays(oldScore: number): void {
    renderKpis();
    renderScorePanel(oldScore);
    renderFlags();
    renderLogs();
    renderDecisionAuditLog();
    renderImpactModalButtonArea();
    renderTimeline();
}

function renderKpis(): void {
    const kpiBar = document.getElementById('kpi-bar');
    if (!kpiBar) return;
    kpiBar.innerHTML = `
        <div class="kpi-item">
            <div class="value">${kpis.reliableWallets.toFixed(1)}%</div>
            <div class="label">Índice de Confiança</div>
        </div>
        <div class="kpi-item">
            <div class="value">${Math.round(kpis.averageScore)}</div>
            <div class="label">Média de Score Global</div>
        </div>
        <div class="kpi-item">
            <div class="value">${kpis.avgResponseTime} ms</div>
            <div class="label">Tempo Médio de Decisão</div>
        </div>
    `;
}

function updateKpis(): void {
    kpis.reliableWallets = Math.max(80, Math.min(99.9, kpis.reliableWallets + (Math.random() * 0.2 - 0.1)));
    kpis.averageScore = scoreHistory.length > 0 ? (scoreHistory.reduce((a, b) => a + b, 0) / scoreHistory.length) : INITIAL_SCORE;
    kpis.avgResponseTime = Math.max(50, Math.min(500, kpis.avgResponseTime + (Math.random() * 20 - 10)));
    renderKpis();
}

function renderScorePanel(oldScore: number): void {
    const scorePanel = document.getElementById('score-panel');
    if (!scorePanel) return;
    scorePanel.innerHTML = `
        <div class="score-value" id="score-value">${Math.round(currentScore)}</div>
        <div class="score-label">Score de Risco Reputacional</div>
        <div class="score-chart-container" id="score-chart">
            ${scoreHistory.length > 1 ? generateSimpleBarChartHTML(scoreHistory, MAX_SCORE_HISTORY) : '<div class="no-items-placeholder" style="font-size:0.75rem; padding:0.4rem;">Aguardando dados...</div>'}
        </div>
    `;
    updateScorePanelVisuals(currentScore, oldScore);
}

function generateSimpleBarChartHTML(history: number[], maxEntries: number): string {
    const chartHeight = 40; 
    const barWidthPercent = 100 / maxEntries;
    const bars = history.map(s => {
        const barHeight = Math.max(1, Math.min(100, (s / 1000) * chartHeight)); 
        let color = 'var(--corporate-info)'; 
        if (s < 400) color = 'var(--corporate-error)';
        else if (s < 600) color = 'var(--corporate-warning)';
        else if (s < 800) color = 'var(--corporate-info)';
        else color = 'var(--corporate-success)';
        return `<div style="width: ${barWidthPercent}%; height: ${barHeight}px; background-color: ${color}; opacity: ${0.7 + (s/2000)}; display: inline-block; vertical-align: bottom; margin: 0 1px; transition: height 0.2s ease, background-color 0.2s ease; border-radius: 1px 1px 0 0;"></div>`;
    }).join('');
    return `<div style="width:100%; height: ${chartHeight}px; display:flex; align-items:flex-end; justify-content:center;">${bars}</div>`;
}


function updateScorePanel(newScore: number, oldScore: number): void {
    const scoreValueEl = document.getElementById('score-value');
    if (scoreValueEl) {
        scoreValueEl.textContent = `${Math.round(newScore)}`;
        updateScorePanelVisuals(newScore, oldScore);
    }
    const scoreChartEl = document.getElementById('score-chart');
     if (scoreChartEl) {
        scoreChartEl.innerHTML = scoreHistory.length > 1 ? generateSimpleBarChartHTML(scoreHistory, MAX_SCORE_HISTORY) : '<div class="no-items-placeholder" style="font-size:0.75rem; padding:0.4rem;">Aguardando dados...</div>';
    }
    if (Math.abs(newScore - oldScore) >= SIGNIFICANT_SCORE_CHANGE_THRESHOLD) {
        addTimelineEvent({
            type: 'score_change',
            title: `SCORE ${newScore > oldScore ? '▲' : '▼'}`,
            description: `Score foi de ${oldScore} para ${newScore}.`,
            data: { scoreChange: newScore - oldScore, value: newScore }
        });
    }
}

function updateScorePanelVisuals(newScore: number, oldScore: number | undefined): void {
    const scoreValueEl = document.getElementById('score-value');
    if (!scoreValueEl || oldScore === undefined) return;

    scoreValueEl.classList.remove('alert', 'score-critical', 'score-high', 'score-medium', 'score-low');
    appContainer.classList.remove('screen-flash-alert'); // Removed flash

    if (newScore < 400) scoreValueEl.classList.add('score-critical');
    else if (newScore < 600) scoreValueEl.classList.add('score-high');
    else if (newScore < 800) scoreValueEl.classList.add('score-medium');
    else scoreValueEl.classList.add('score-low');


    if ((oldScore - newScore) > 50) { 
        // No visual alert animation, just log
        if (alertSound && alertSound.src && typeof alertSound.play === 'function') { 
            alertSound.play().catch(e => console.warn("Falha ao reproduzir áudio de alerta:", e)); 
        }
        addLogEntry(`ALERTA: Queda de score significativa! (${oldScore - newScore} pontos)`, 'error', true);
    }
}

async function addNewFlag(flagType: FlagType, scenarioId?: string, simulateProcessing: boolean = false): Promise<void> {
    if (activeFlags.some(f => f.name === flagType.name && (f.scenarioId === scenarioId || !scenarioId))) {
        if(isModuleActive("Dynamic Flag Council (DFC)")) return;
    }

    const oldScoreForFlag = currentScore;
    let explanation = "Carregando explicação...";

    let effectiveWeight = flagType.weight;
    if (!isModuleActive("ScoreLab Core")) {
        effectiveWeight = Math.round(effectiveWeight * (0.5 + Math.random() * 0.5)); 
         addLogEntry(`ScoreLab Core DEGRADADO: Impacto da flag "${flagType.name}" pode ser impreciso.`, 'warning');
    }

    const newFlag: Flag = {
        id: `flag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: flagType.name,
        weight: effectiveWeight,
        explanation: API_KEY ? explanation : "Explicação detalhada do risco (API Key não configurada).",
        timestamp: new Date(),
        scenarioId: scenarioId,
        severity: flagType.severity,
    };

    activeFlags.unshift(newFlag);
    currentScore += effectiveWeight; 
    currentScore = Math.max(0, Math.min(1000, currentScore)); 

    addLogEntry(`Nova flag: ${flagType.name} (Peso Efetivo: ${effectiveWeight}). Score: ${currentScore}`, flagType.severity === 'critical' || flagType.severity === 'high' ? 'warning' : 'info');
    if (flagType.severity === 'critical') {
        addTimelineEvent({type: 'critical_flag', title: `FLAG: ${flagType.name.substring(0,12)}!`, data: { flagName: flagType.name } });
    }
    updateScorePanel(currentScore, oldScoreForFlag);
    renderFlags(newFlag.id); 

    if (simulateProcessing) { 
        await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 600)); 
    }

    if (!API_KEY) {
        console.warn("API_KEY não configurada, utilizando explicação placeholder para flag.");
        const flagIndex = activeFlags.findIndex(f => f.id === newFlag.id);
        if (flagIndex !== -1) {
            activeFlags[flagIndex].explanation = "A API Key do Gemini não foi configurada. Esta é uma explicação placeholder para o risco associado a esta flag. Em um ambiente real, uma descrição detalhada seria gerada pela IA.";
            if(!isModuleActive("Dynamic Flag Council (DFC)")) {
                 activeFlags[flagIndex].explanation += " (DFC Degradado: Contextualização da flag pode estar limitada.)";
            }
        }
        renderFlags();
        return;
    }

    try {
        let finalPrompt = flagType.basePrompt;
        if(!isModuleActive("Dynamic Flag Council (DFC)")) {
            finalPrompt = `Como o DFC está degradado, explique de forma mais bruta e menos contextualizada: ${flagType.basePrompt}`;
        }

        if (USE_REAL_API) { 
             const response = await ai.models.generateContent({
                model: GEMINI_MODEL_NAME,
                contents: finalPrompt,
            });
            explanation = response.text || "Não foi possível gerar a explicação.";
        } else { 
            // Fallback for when USE_REAL_API is false but API_KEY might be present (simulated call)
            // Or, if API_KEY is present, this block will still make a real call.
            // To truly avoid API call when USE_REAL_API is false, add explicit check.
            if (API_KEY) { // Check API_KEY again, as !API_KEY is handled later
                const response = await ai.models.generateContent({
                    model: GEMINI_MODEL_NAME,
                    contents: finalPrompt,
                });
                explanation = response.text || "Não foi possível gerar a explicação (simulado).";
            } else {
                 explanation = "Explicação simulada: " + flagType.basePrompt.substring(0, 100) + "... (API não usada)";
            }
        }
    } catch (error) {
        console.error("Erro ao gerar explicação da flag:", error);
        explanation = "Erro ao gerar explicação. Verifique o console para detalhes.";
        if (error instanceof Error && error.message.includes('API key not valid')) {
            explanation = "Chave de API inválida. Verifique a configuração.";
        }
    }

    const flagIndex = activeFlags.findIndex(f => f.id === newFlag.id);
    if (flagIndex !== -1) {
        activeFlags[flagIndex].explanation = explanation;
    }
    renderFlags();
}


function renderFlags(newFlagId?: string): void {
    const flagsList = document.getElementById('flags-list');
    if (!flagsList) return;
    if (activeFlags.length === 0) {
        flagsList.innerHTML = '<p class="no-items-placeholder">Nenhuma flag ativa no momento.</p>';
        return;
    }
    flagsList.innerHTML = activeFlags.map(flag => `
        <div class="flag-item severity-${flag.severity} ${flag.id === newFlagId ? 'new-flag-fade-in' : ''}" id="${flag.id}">
            <div class="flag-header">
                <span class="flag-severity-indicator severity-${flag.severity}-indicator"></span>
                <strong>${flag.name}</strong>
            </div>
            <p class="explanation">${flag.explanation}</p>
            <p class="timestamp">${flag.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
        </div>
    `).join('');

    if (newFlagId) {
        // Fade-in is handled by CSS animation, no need to remove class
    }
}

function renderLogs(): void {
    const logsList = document.getElementById('logs-list');
    if (!logsList) return;
    if (logEntries.length === 0) {
        logsList.innerHTML = '<p class="no-items-placeholder">Nenhum log disponível.</p>';
        return;
    }
    logsList.innerHTML = logEntries.slice().reverse().map(entry => `
        <div class="log-entry ${entry.type}">
            <span class="timestamp">[${entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
            <span class="message">${entry.message}</span>
        </div>
    `).join('');
}

function addLogEntry(message: string, type: LogEntry['type'], important: boolean = false): void {
    console.log(`[${type.toUpperCase()}] ${message}`);
    logEntries.push({ message, timestamp: new Date(), type });
    if (logEntries.length > 100) { 
        logEntries.shift();
    }
    renderLogs();
}

function setupDecisionButtonListeners(): void {
    const decisionActionsContainer = document.getElementById('decision-actions');
    if (decisionActionsContainer) {
        decisionActionsContainer.addEventListener('click', (event: MouseEvent) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.classList.contains('decision-button') && !isLoadingDecision) {
                const action = target.dataset.action;
                if (action) {
                    handleDecision(action);
                }
            }
        });
    }
}

function getRelevantFoundLabModuleText(flags: Flag[]): string {
    const criticalFlagNames = flags.filter(f => f.severity === 'critical' || f.severity === 'high').map(f => f.name);
    let relevantModules = new Set<string>();

    if (criticalFlagNames.length === 0) { 
        return "módulos como ScoreLab Core e Dynamic Flag Council (DFC)";
    }

    for (const flagName of criticalFlagNames) {
        for (const product of productCatalog) {
            if (product.relatedFlags?.includes(flagName)) {
                if (product.name === "FoundLab Core") { 
                     product.coreModulesUsedTitles?.forEach(m => {
                        if (["ScoreLab Core", "Anomaly Detector", "Dynamic Flag Council (DFC)", "Sherlock Validator"].includes(m)) {
                            relevantModules.add(m);
                        }
                     });
                } else if (product.coreModulesUsedTitles && product.coreModulesUsedTitles.length > 0) {
                    relevantModules.add(product.coreModulesUsedTitles[0]);
                    if (product.coreModulesUsedTitles.length > 1 && product.coreModulesUsedTitles[0] !== "ScoreLab Core") relevantModules.add(product.coreModulesUsedTitles[1]);
                } else {
                     relevantModules.add(product.name); 
                }
            }
        }
    }
    if (relevantModules.size === 0 || !Array.from(relevantModules).some(m => ["ScoreLab Core", "Anomaly Detector", "Dynamic Flag Council (DFC)", "Veritas Protocol", "Guardian AI"].includes(m))) {
        relevantModules.add("ScoreLab Core");
        relevantModules.add("Dynamic Flag Council (DFC)");
    }
    
    const moduleArray = Array.from(relevantModules);
    if (moduleArray.length === 1) return `módulos como ${moduleArray[0]}`;
    if (moduleArray.length === 2) return `módulos como ${moduleArray.join(' e ')}`;
    if (moduleArray.length > 2) return `módulos como ${moduleArray.slice(0, 2).join(', ')} e outros componentes FoundLab`;
    
    return "o ecossistema FoundLab Nexus"; 
}


async function handleDecision(action: string): Promise<void> {
    if (!simulationIntervalId && !activeFlags.length) { 
        addLogEntry("Inicie uma simulação ou configure um cenário para tomar decisões.", "warning");
        return;
    }
    isLoadingDecision = true;
    lastBlockContextForImpactView = null; 
    decisionLoaderOverlay.classList.remove('hidden');
    if (decisionLoaderProgressBar) decisionLoaderProgressBar.style.width = '0%'; 

    // Animate progress bar for corporate feel (linear, not easing)
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 10;
        if (decisionLoaderProgressBar) decisionLoaderProgressBar.style.width = `${Math.min(100, progress)}%`;
        if (progress >= 100) clearInterval(progressInterval);
    }, DECISION_PROCESSING_TIME / 10);


    await new Promise(resolve => setTimeout(resolve, DECISION_PROCESSING_TIME)); 
    clearInterval(progressInterval); // Ensure interval is cleared

    const decisionMessage = `Decisão: ${action.charAt(0).toUpperCase() + action.slice(1)}`;
    addLogEntry(decisionMessage, 'decision', true);
    
    const scoreBeforeDecision = currentScore;
    let scoreChange = 0;
    let auditDetails = `Decisão manual: ${action}.`;

    if (action === 'authorize') {
        scoreChange = currentScore < 700 ? Math.floor(Math.random() * 15) + 5 : Math.floor(Math.random() * 5);
        if (!isModuleActive("ScoreLab Core")) {
            scoreChange = Math.round(scoreChange * 0.5); 
            auditDetails += " (ScoreLab Core DEGRADADO: Efeito da autorização reduzido)";
            addLogEntry("ScoreLab Core DEGRADADO: Efeito positivo da decisão 'Autorizar' reduzido.", 'warning');
        }
    } else if (action === 'block') {
        scoreChange = currentScore > 300 ? -(Math.floor(Math.random() * 10) + 2) : 0; 
        const contributingFlags = activeFlags.filter(f => f.severity === 'critical' || f.severity === 'high');
        lastBlockContextForImpactView = {
            scoreBeforeDecision: scoreBeforeDecision,
            scoreAfterBlock: Math.max(0, Math.min(1000, scoreBeforeDecision + scoreChange)), 
            contributingFlags: contributingFlags.length > 0 ? contributingFlags : activeFlags.slice(0, 2), 
            decisionTime: DECISION_PROCESSING_TIME,
            relevantFoundLabModuleText: getRelevantFoundLabModuleText(contributingFlags.length > 0 ? contributingFlags : activeFlags)
        };
        auditDetails += ` Impacto analisado com ${lastBlockContextForImpactView.contributingFlags.length} flag(s) contribuinte(s).`;
        addTimelineEvent({type: 'block_decision', title: 'BLOCK', description: `Score antes: ${scoreBeforeDecision}, depois: ${lastBlockContextForImpactView.scoreAfterBlock}`});
    } else if (action === 'review') {
        scoreChange = Math.floor(Math.random() * 6) - 3; 
        auditDetails += " Item marcado para revisão manual detalhada.";
    }
    currentScore = Math.max(0, Math.min(1000, currentScore + scoreChange));
    
    updateScorePanel(currentScore, scoreBeforeDecision);

    saveDecisionToAuditLog({
        id: `audit-${Date.now()}`,
        timestamp: new Date(),
        decision: action,
        scoreBefore: scoreBeforeDecision,
        scoreAfter: currentScore,
        details: auditDetails
    });
    
    renderImpactModalButtonArea(); 

    isLoadingDecision = false;
    decisionLoaderOverlay.classList.add('hidden');
    document.querySelectorAll('.decision-button.recommended-action-pulse').forEach(btn => btn.classList.remove('recommended-action-pulse'));
}

// --- IMPACT MODAL ---
function renderImpactModalButtonArea(): void {
    const area = document.getElementById('impact-button-area');
    if (!area) return;

    if (lastBlockContextForImpactView) {
        area.innerHTML = `
            <button id="view-impact-button" class="cta-button attention-cta">Analisar Impacto da Decisão</button>
        `;
        document.getElementById('view-impact-button')?.addEventListener('click', () => {
            if (lastBlockContextForImpactView) {
                renderImpactComparisonModal(lastBlockContextForImpactView);
                isImpactModalVisible = true;
                impactModalBackdrop?.classList.remove('hidden');
                impactModalContentEl?.focus();
            }
        });
    } else {
        area.innerHTML = ''; 
    }
}

function renderImpactComparisonModal(context: LastBlockContext): void {
    if (!impactModalContentEl || !impactModalBackdrop) return;

    impactModalBackdrop.setAttribute('aria-labelledby', 'impact-modal-title-main');
    impactModalContentEl.setAttribute('role', 'document');


    const withFoundLabFlags = context.contributingFlags.length > 0 
        ? context.contributingFlags.map(f => `<li>${f.name} (Severidade: ${f.severity})</li>`).join('')
        : "<li>Nenhuma flag crítica específica identificada como motor principal, decisão baseada no score geral.</li>";
    
    impactModalContentEl.innerHTML = `
        <h2 class="impact-modal-title" id="impact-modal-title-main">Análise de Impacto da Decisão: Bloqueio</h2>
        <div class="impact-comparison-container">
            <div class="impact-column with-foundlab">
                <h3><span class="icon"></span>Com FoundLab Nexus</h3>
                <div class="impact-section">
                    <h4>Flags Críticas Acionadas:</h4>
                    <ul>${withFoundLabFlags}</ul>
                </div>
                <div class="impact-section">
                    <h4>Alteração de Score:</h4>
                    <p class="score-change">${context.scoreBeforeDecision} <span class="arrow">➔</span> ${context.scoreAfterBlock}</p>
                </div>
                <div class="impact-section">
                    <h4>Resultado:</h4>
                    <p>Risco reputacional crítico ISOLADO.</p>
                </div>
                <div class="impact-section">
                    <h4>Eficiência:</h4>
                    <p>Decisão automática em <strong>${context.decisionTime}ms</strong>.</p>
                </div>
                <div class="impact-section">
                    <h4>Benefício Direto:</h4>
                    <p class="benefit">Prejuízo financeiro e/ou fraude complexa EVITADA. Integridade e compliance MANTIDOS.</p>
                </div>
            </div>

            <div class="impact-column without-foundlab">
                <h3><span class="icon"></span>Simulação Sem FoundLab Nexus</h3>
                <div class="impact-section">
                    <h4>Flags Críticas:</h4>
                    <p>Nenhuma flag crítica correspondente teria sido gerada / processada adequadamente.</p>
                </div>
                <div class="impact-section">
                    <h4>Score (Hipótese):</h4>
                    <p class="score-change-hypothetical">Score permaneceria em <strong>${context.scoreBeforeDecision}</strong> (ou próximo, mascarando o risco real).</p>
                </div>
                <div class="impact-section">
                    <h4>Resultado (Hipótese):</h4>
                    <p class="outcome-hypothetical">Transação (provavelmente) seria APROVADA.</p>
                </div>
                <div class="impact-section">
                    <h4>Risco (Não Mitigado):</h4>
                    <p class="risk-unmitigated">Risco crítico NÃO IDENTIFICADO.</p>
                    <div class="warning-seal">Selo: Risco não identificado no seu sistema atual.</div>
                </div>
                <div class="impact-section">
                    <h4>Consequência (Hipótese):</h4>
                    <p class="consequence-hypothetical">Potencial para <strong>fraude materializada</strong>, perda financeira direta, e/ou severo <strong>comprometimento de compliance</strong> regulatório.</p>
                </div>
                 <p class="module-impact-note"><em>Este veredito seria drasticamente diferente sem a intervenção de ${context.relevantFoundLabModuleText || "componentes chave do FoundLab Nexus"}.</em></p>
            </div>
        </div>
        <div class="modal-actions">
            <button class="modal-button secondary" id="impact-modal-close-btn-bottom">Fechar Análise</button>
        </div>
    `;
    document.getElementById('impact-modal-close-btn-bottom')?.addEventListener('click', closeImpactModal);
}

function closeImpactModal(): void {
    isImpactModalVisible = false;
    impactModalBackdrop?.classList.add('hidden');
}

function setupImpactModalCloseActions(): void {
    impactModalCloseButtonTop?.addEventListener('click', closeImpactModal);
    impactModalBackdrop?.addEventListener('click', (event: MouseEvent) => {
        if (event.target === impactModalBackdrop) {
            closeImpactModal();
        }
    });
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape' && isImpactModalVisible) {
            closeImpactModal();
        }
    });
}


// --- PRODUCT CATALOG MODE (FOUNDLAB ATLAS) ---
function renderCatalogMode(): void {
    appContent.innerHTML = `
        <div class="content-title">FoundLab Atlas - Catálogo de Soluções</div>
        <div class="product-catalog-grid" id="product-catalog-grid">
            ${productCatalog.map(product => `
                <div class="product-card" data-product-id="${product.id}" role="button" tabindex="0" aria-labelledby="product-title-${product.id}">
                    <h3 id="product-title-${product.id}">${product.name}</h3>
                    <p class="description">${product.shortDescription}</p>
                    <div class="diagram-placeholder">${product.mainImagePlaceholder}</div>
                    <button class="cta-button" data-product-id="${product.id}" aria-label="Ver ${product.name} em ação">Ver em Ação</button>
                </div>
            `).join('')}
        </div>
        <div class="core-modules-section">
            <h2 class="section-title">Arquitetura FoundLab Core - Visualização Interativa</h2>
            <div class="core-modules-filters">
                <input type="search" id="module-search-input" placeholder="Buscar módulos..." aria-label="Buscar módulos pelo título" value="${currentModuleFilterText}">
                <select id="module-type-filter" aria-label="Filtrar por tipo de módulo">
                    <option value="all" ${currentModuleTypeFilter === 'all' ? 'selected' : ''}>Todos os Tipos</option>
                    ${allModuleTypes.map(type => `<option value="${type}" ${currentModuleTypeFilter === type ? 'selected' : ''}>${type}</option>`).join('')}
                </select>
                <label class="moat-filter-label">
                    <input type="checkbox" id="module-moat-filter" ${currentModuleMoatFilter ? 'checked' : ''}>
                    Apenas Moat
                </label>
                <select id="module-sort-order" aria-label="Ordenar módulos">
                    <option value="alphabetical" ${currentModuleSortOrder === 'alphabetical' ? 'selected' : ''}>Ordem Alfabética</option>
                    <option value="impact" ${currentModuleSortOrder === 'impact' ? 'selected' : ''}>Por Impacto</option>
                </select>
            </div>
            <div id="core-modules-diagram-container" class="core-modules-diagram-container">
                <div class="mermaid" id="core-modules-mermaid-chart">
                    <!-- Mermaid diagram will be rendered here -->
                </div>
            </div>
            <div id="core-modules-list-fallback">
                <!-- Fallback list / Click prompt will be here if diagram fails or for accessibility -->
            </div>
        </div>
    `;
    const catalogGrid = document.getElementById('product-catalog-grid');
    if (catalogGrid) {
        catalogGrid.addEventListener('click', (event) => {
            const targetElement = (event.target as HTMLElement).closest('.product-card, .cta-button');

            if (targetElement instanceof HTMLElement && targetElement.dataset.productId) {
                const productId = targetElement.dataset.productId;
                const product = productCatalog.find(p => p.id === productId);
                if (product) {
                    if (targetElement.classList.contains('cta-button')) {
                        currentMode = 'simulator';
                        activeProductDemoName = product.name; // STATE SET HERE
                        updateActiveButtonStyles();
                        clearAppContent();
                        renderSimulatorMode(product.scenarioId); // Pass scenarioId to renderSimulatorMode
                    } else {
                        showProductModal(product);
                    }
                }
            }
        });
    }

    renderCoreModulesDiagram(); 

    const searchInput = document.getElementById('module-search-input') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
        currentModuleFilterText = (e.target as HTMLInputElement).value;
        renderCoreModulesDiagram();
    });

    const typeFilter = document.getElementById('module-type-filter') as HTMLSelectElement;
    typeFilter?.addEventListener('change', (e) => {
        currentModuleTypeFilter = (e.target as HTMLSelectElement).value as ModuleType | 'all';
        renderCoreModulesDiagram();
    });

    const moatFilter = document.getElementById('module-moat-filter') as HTMLInputElement;
    moatFilter?.addEventListener('change', (e) => {
        currentModuleMoatFilter = (e.target as HTMLInputElement).checked;
        renderCoreModulesDiagram();
    });
    
    const sortOrderFilter = document.getElementById('module-sort-order') as HTMLSelectElement;
    sortOrderFilter?.addEventListener('change', (e) => {
        currentModuleSortOrder = (e.target as HTMLSelectElement).value as 'alphabetical' | 'impact';
        renderCoreModulesDiagram();
    });
}

function renderCoreModulesDiagram(): void {
    const diagramContainer = document.getElementById('core-modules-mermaid-chart');
    const fallbackContainer = document.getElementById('core-modules-list-fallback');
    if (!diagramContainer || !fallbackContainer) return;

    let filteredModules = [...foundLabModules];

    if (currentModuleFilterText.trim() !== '') {
        const searchTerm = currentModuleFilterText.toLowerCase().trim();
        filteredModules = filteredModules.filter(module => 
            module.title.toLowerCase().includes(searchTerm) ||
            module.description.toLowerCase().includes(searchTerm)
        );
    }
    if (currentModuleTypeFilter !== 'all') {
        filteredModules = filteredModules.filter(module => module.moduleType === currentModuleTypeFilter);
    }
    if (currentModuleMoatFilter) {
        filteredModules = filteredModules.filter(module => module.isMoat === true);
    }
    if (currentModuleSortOrder === 'impact') {
        filteredModules.sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0));
    } else { 
        filteredModules.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (filteredModules.length === 0) {
        diagramContainer.innerHTML = '';
        fallbackContainer.innerHTML = `<p class="no-items-placeholder">Nenhum módulo encontrado com os filtros aplicados.</p>`;
        return;
    }
    
    fallbackContainer.innerHTML = `<p class="diagram-interaction-prompt">Clique em um módulo no diagrama para ver detalhes. Se o diagrama não carregar, verifique o console.</p>
        <div class="core-modules-grid">
        ${filteredModules.map(module => `
             <div class="core-module-card" title="${module.description.replace(/"/g, '&quot;')}" data-module-id="${module.id}" role="button" tabindex="0">
                <div class="module-card-header">
                    <span class="module-title">${module.title}</span>
                    ${module.isMoat ? '<span class="module-moat-badge">Moat</span>' : ''}
                </div>
                <div class="module-card-content">
                    <span class="module-type-badge type-${module.moduleType.toLowerCase().replace(/\s|\//g, '-')}">${module.moduleType} ${module.impactScore ? `(Impacto: ${module.impactScore})` : ''}</span>
                </div>
            </div>`).join('')}
        </div>
    `;
    
    const fallbackGrid = fallbackContainer.querySelector('.core-modules-grid');
    fallbackGrid?.addEventListener('click', (event) => {
        const card = (event.target as HTMLElement).closest('.core-module-card');
        if (card instanceof HTMLElement && card.dataset.moduleId) {
            const moduleId = card.dataset.moduleId;
            const module = foundLabModules.find(m => m.id === moduleId);
            if (module) {
                showCoreModuleModal(module);
            }
        }
    });


    let mermaidDefinition = 'graph TD;\n';
    mermaidDefinition += '    subgraph "Produtos FoundLab"\n        direction LR\n';
    productCatalog.forEach(p => {
        mermaidDefinition += `        P_${p.id}["${p.name.replace(/"/g, '#quot;')}"]:::productNode;\n`;
    });
    mermaidDefinition += '    end\n';
    
    mermaidDefinition += '    subgraph "Módulos Core FoundLab (Filtrados)"\n        direction LR\n';
    filteredModules.forEach(m => {
        const label = `${m.title.replace(/"/g, '#quot;')} (${m.moduleType.replace(/"/g, '#quot;')})`;
        mermaidDefinition += `        M_${m.id}["${label}"]:::moduleNode${m.isMoat ? 'Moat' : ''};\n`;
        mermaidDefinition += `        click M_${m.id} call window.handleMermaidNodeClick("${m.id}") "Ver detalhes de ${m.title.replace(/"/g, '#quot;')}";\n`;
    });
    mermaidDefinition += '    end\n';

    productCatalog.forEach(p => {
        p.coreModulesUsedTitles?.forEach(moduleTitle => {
            const coreModule = foundLabModules.find(fm => fm.title === moduleTitle);
            if (coreModule && filteredModules.some(fm => fm.id === coreModule.id)) { 
                mermaidDefinition += `    P_${p.id} --> M_${coreModule.id};\n`;
            }
        });
    });

    // Corporate Mermaid styling
    mermaidDefinition += `    classDef productNode fill:var(--corporate-surface),stroke:var(--corporate-border),stroke-width:1px,color:var(--corporate-text-primary),rx:var(--border-radius-small),ry:var(--border-radius-small),padding:8px,font-family:var(--font-sans),font-size:11px,font-weight:400;\n`;
    mermaidDefinition += `    classDef moduleNode fill:var(--corporate-surface),stroke:var(--corporate-border),stroke-width:1px,color:var(--corporate-text-secondary),rx:var(--border-radius-small),ry:var(--border-radius-small),padding:7px,font-family:var(--font-sans),font-size:10px,font-weight:400;\n`;
    mermaidDefinition += `    classDef moduleNodeMoat fill:var(--corporate-surface),stroke:var(--corporate-primary-blue),stroke-width:1px,color:var(--corporate-primary-blue),font-weight:500,font-family:var(--font-sans),font-size:10px;\n`;
    
    diagramContainer.innerHTML = mermaidDefinition;

    try {
        if (window.mermaid) {
            window.mermaid.run({
                nodes: [diagramContainer]
            });
        }
    } catch (e) {
        console.error("Erro ao renderizar diagrama Mermaid:", e);
        diagramContainer.innerHTML = "<p class='error-message' style='text-align:center;'>Erro ao renderizar diagrama. Verifique o console.</p>";
        fallbackContainer.innerHTML = `<p class="error-message">Falha ao renderizar o diagrama interativo. Usando lista de módulos abaixo.</p>` + fallbackContainer.innerHTML;
    }
}

(window as any).handleMermaidNodeClick = (moduleId: string) => {
    const module = foundLabModules.find(m => m.id === moduleId);
    if (module) {
        showCoreModuleModal(module);
    } else {
        console.warn("Módulo não encontrado para o clique do Mermaid:", moduleId);
    }
};



function showProductModal(product: Product): void {
    productModalBackdrop.setAttribute('aria-labelledby', `product-modal-title-${product.id}`);
    productModalContentEl.setAttribute('role', 'document');

    productModalContentEl.innerHTML = `
        <h2 id="product-modal-title-${product.id}">${product.name}</h2>
        <div class="modal-image-placeholder">${product.mainImagePlaceholder}</div>

        <h3 class="modal-section-title">Como Funciona</h3>
        <ul>${product.howItWorks.map(item => `<li>${item}</li>`).join('')}</ul>

        <h3 class="modal-section-title">O que Resolve</h3>
        <ul>${product.whatItSolves.map(item => `<li>${item}</li>`).join('')}</ul>

        <h3 class="modal-section-title">Quem Utilizaria</h3>
        <ul>${product.whoWouldUse.map(item => `<li>${item}</li>`).join('')}</ul>
        
        <h3 class="modal-section-title">Módulos Core Utilizados</h3>
        ${product.coreModulesUsedTitles && product.coreModulesUsedTitles.length > 0 ? 
            `<ul class="core-modules-list-in-modal">${product.coreModulesUsedTitles.map(title => `<li>${title}</li>`).join('')}</ul>` : 
            '<p>Informação sobre módulos não disponível.</p>'}


        <h3 class="modal-section-title">Demonstração em Vídeo (Conceito)</h3>
        <div class="modal-video-placeholder">
            <p><em>Roteiro: ${product.videoPlaceholderScript}</em></p>
        </div>

        <div class="case-study-box">
            <h4 class="modal-subsection-title">Estudo de Caso Fictício: ${product.fakeCaseStudy.title}</h4>
            <p>${product.fakeCaseStudy.text}</p>
        </div>

        <div class="testimonial-box">
            <h4 class="modal-subsection-title">Depoimento Institucional Fictício</h4>
            <p class="quote">"${product.fakeTestimonial.quote}"</p>
            <p class="author">&mdash; ${product.fakeTestimonial.author}, ${product.fakeTestimonial.company}</p>
        </div>

        <div class="modal-actions">
            <button class="modal-button secondary" id="product-modal-close-btn-bottom">Fechar</button>
            <button class="modal-button primary" id="product-modal-cta-btn" aria-label="Ver ${product.name} em simulação">Ver em Ação</button>
        </div>
    `;
    productModalBackdrop.classList.remove('hidden');
    productModalContentWrapper.focus(); 

    document.getElementById('product-modal-close-btn-bottom')?.addEventListener('click', closeProductModal);
    
    document.getElementById('product-modal-cta-btn')?.addEventListener('click', () => {
        closeProductModal();
        currentMode = 'simulator';
        activeProductDemoName = product.name; 
        updateActiveButtonStyles();
        clearAppContent(); 
        renderSimulatorMode(product.scenarioId); 
    });
}

function closeProductModal(): void {
    productModalBackdrop.classList.add('hidden');
}

function setupProductModalCloseActions(): void {
    productModalCloseButtonTop.addEventListener('click', closeProductModal);
    productModalBackdrop.addEventListener('click', (event: MouseEvent) => {
        if (event.target === productModalBackdrop) { 
            closeProductModal();
        }
    });
}


// --- CORE MODULE DETAIL MODAL ---
function showCoreModuleModal(module: FoundLabModule): void {
    coreModuleModalBackdrop.setAttribute('aria-labelledby', `core-module-modal-title-${module.id}`);
    coreModuleModalContentEl.setAttribute('role', 'document');

    let architectureHTML = '';
    if (module.visualArchitecture) {
        switch (module.visualArchitecture.type) {
            case 'mermaid':
                architectureHTML = `<div class="mermaid">${module.visualArchitecture.content}</div>`;
                break;
            case 'text_diagram':
                architectureHTML = `<pre class="text-diagram">${module.visualArchitecture.content}</pre>`;
                break;
            case 'img_placeholder': // Corporate placeholder styling
                architectureHTML = `<div class="modal-image-placeholder" style="height: auto; min-height:100px; text-align:left; background-color: var(--corporate-background); padding: 0.75rem;"><em>${module.visualArchitecture.content}</em></div>`;
                break;
        }
    }

    const productsUsingThisModule = productCatalog.filter(p => 
        p.coreModulesUsedTitles && p.coreModulesUsedTitles.includes(module.title)
    );

    coreModuleModalContentEl.innerHTML = `
        <h2 id="core-module-modal-title-${module.id}">${module.title} ${module.isMoat ? '<span class="moat-badge-inline">Moat</span>' : ''}</h2>
        <p class="module-modal-description">${module.description}</p>
        
        <div class="module-meta-grid">
            <div><strong>Tipo:</strong> <span class="module-type-badge type-${module.moduleType.toLowerCase().replace(/\s|\//g, '-')}">${module.moduleType}</span></div>
            ${module.impactScore ? `<div><strong>Impacto Estimado:</strong> ${module.impactScore}/10</div>` : ''}
        </div>

        ${module.purposeDefends ? `
            <h3 class="modal-section-title">Propósito Principal</h3>
            <p>${module.purposeDefends}</p>
        ` : ''}
        ${module.riskIsolates ? `
            <h3 class="modal-section-title">Riscos Mitigados</h3>
            <p>${module.riskIsolates}</p>
        ` : ''}
        ${module.activationCondition ? `
            <h3 class="modal-section-title">Condição de Ativação Típica</h3>
            <p>${module.activationCondition}</p>
        ` : ''}
        ${module.realWorldUse ? `
            <h3 class="modal-section-title">Exemplo de Aplicação Real</h3>
            <p>${module.realWorldUse}</p>
        ` : ''}

        ${architectureHTML ? `
            <h3 class="modal-section-title">Arquitetura Visual (Exemplo)</h3>
            ${architectureHTML}
        ` : ''}

        ${module.exampleInput ? `
            <h3 class="modal-section-title">Exemplo de Input</h3>
            <pre class="code-block">${module.exampleInput}</pre>
        ` : ''}
        ${module.exampleOutput ? `
            <h3 class="modal-section-title">Exemplo de Output</h3>
            <pre class="code-block">${module.exampleOutput}</pre>
        ` : ''}
        
        ${productsUsingThisModule.length > 0 ? `
            <h3 class="modal-section-title">Utilizado nos Produtos:</h3>
            <ul class="core-modules-list-in-modal">${productsUsingThisModule.map(p => `<li>${p.name}</li>`).join('')}</ul>
        ` : ''}

        <div class="modal-actions">
            <button class="modal-button secondary" id="core-module-modal-close-btn-bottom">Fechar</button>
        </div>
    `;

    coreModuleModalBackdrop.classList.remove('hidden');
    coreModuleModalContentWrapper.focus();

    if (module.visualArchitecture?.type === 'mermaid') {
        try {
            if (window.mermaid) {
                 const mermaidElement = coreModuleModalContentEl.querySelector('.mermaid');
                 if (mermaidElement) {
                    window.mermaid.run({
                        nodes: [mermaidElement]
                    });
                 }
            } else {
                console.error("Biblioteca Mermaid não encontrada no objeto window.");
            }
        } catch (e) {
            console.error("Erro ao renderizar diagrama Mermaid:", e);
            const mermaidContainer = coreModuleModalContentEl.querySelector('.mermaid');
            if (mermaidContainer) mermaidContainer.innerHTML = "<p class='error-message' style='text-align:center;'>Erro ao renderizar diagrama.</p>";
        }
    }


    document.getElementById('core-module-modal-close-btn-bottom')?.addEventListener('click', closeCoreModuleModal);
}

function closeCoreModuleModal(): void {
    coreModuleModalBackdrop.classList.add('hidden');
}

function setupCoreModuleModalCloseActions(): void {
    coreModuleModalCloseButtonTop.addEventListener('click', closeCoreModuleModal);
    coreModuleModalBackdrop.addEventListener('click', (event: MouseEvent) => {
        if (event.target === coreModuleModalBackdrop) {
            closeCoreModuleModal();
        }
    });
}

// --- DOCUMENTS MODE (Formerly Proof Panel) ---
function renderDocumentsMode(): void {
    appContent.innerHTML = `
        <div class="content-title">Documentos Institucionais e Blueprints</div>
        <div class="documents-container">
            <p class="documents-intro">
                Explore nossa coleção de white papers, blueprints técnicos e visões estratégicas 
                para entender a profundidade e a inovação por trás da FoundLab.
            </p>
            <div class="document-list">
                ${foundLabDocumentCollection.map(doc => `
                    <div class="document-card" role="article" aria-labelledby="doc-title-${doc.id}">
                        <div class="document-card-header">
                            <h3 class="document-title" id="doc-title-${doc.id}">${doc.title}</h3>
                            <span class="document-type-badge">${doc.type}</span>
                        </div>
                        <p class="document-summary">${doc.summary}</p>
                        <div class="document-meta">
                            ${doc.author ? `<span class="meta-item"><strong>Autor:</strong> ${doc.author}</span>` : ''}
                            ${doc.publicationDate ? `<span class="meta-item"><strong>Publicado em:</strong> ${doc.publicationDate}</span>` : ''}
                        </div>
                        <div class="document-keywords">
                            ${doc.keywords.map(kw => `<span class="keyword-tag">${kw}</span>`).join('')}
                        </div>
                        <div class="document-actions">
                            ${doc.readMoreLinkPlaceholder ? `<a href="${doc.readMoreLinkPlaceholder}" class="document-link" target="_blank" rel="noopener noreferrer">Ler Mais (Simulado)</a>` : ''}
                            ${doc.downloadLinkPlaceholder ? `<a href="${doc.downloadLinkPlaceholder}" class="document-link download" target="_blank" rel="noopener noreferrer">Baixar PDF (Simulado)</a>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}


// --- DECISION AUDIT LOG ---
const AUDIT_LOG_STORAGE_KEY = 'foundLabNexusAuditLog';

function loadDecisionAuditLogFromStorage(): void {
    const storedLog = localStorage.getItem(AUDIT_LOG_STORAGE_KEY);
    if (storedLog) {
        try {
            decisionAuditLog = JSON.parse(storedLog).map((entry: any) => ({
                ...entry,
                timestamp: new Date(entry.timestamp) 
            }));
        } catch (e) {
            console.error("Falha ao analisar log de auditoria do localStorage", e);
            decisionAuditLog = [];
        }
    }
    renderDecisionAuditLog();
}

function saveDecisionToAuditLog(entry: DecisionAuditEntry): void {
    if (USE_REAL_API) {
        console.log("Simulando chamada de API para postDecisionLog com:", entry);
    }
    decisionAuditLog.unshift(entry); 
    if (decisionAuditLog.length > 50) { 
        decisionAuditLog.pop();
    }
    localStorage.setItem(AUDIT_LOG_STORAGE_KEY, JSON.stringify(decisionAuditLog));
    renderDecisionAuditLog();
}

function renderDecisionAuditLog(): void {
    const listEl = document.getElementById('decision-audit-log-list');
    if (!listEl) return;

    if (decisionAuditLog.length === 0) {
        listEl.innerHTML = '<p class="no-items-placeholder">Nenhuma decisão auditada ainda.</p>';
        return;
    }

    listEl.innerHTML = decisionAuditLog.map(entry => `
        <div class="audit-log-entry">
            <strong>${entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong> - Decisão: ${entry.decision.toUpperCase()}
            (Score: ${entry.scoreBefore} ➔ ${entry.scoreAfter}) - <em>${entry.details}</em>
        </div>
    `).join('');
}

declare global {
    interface Window {
        mermaid: any; 
        handleMermaidNodeClick: (moduleId: string) => void;
    }
}
// Add a global keydown listener for Escape to close any active modal
document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
        if (!productModalBackdrop.classList.contains('hidden')) {
            closeProductModal();
        } else if (!coreModuleModalBackdrop.classList.contains('hidden')) {
            closeCoreModuleModal();
        } else if (isImpactModalVisible && impactModalBackdrop && !impactModalBackdrop.classList.contains('hidden')) {
            closeImpactModal();
        }
    }
});