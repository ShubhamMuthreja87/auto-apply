/**
 * The first-boot seed for the single user document (D13). Built only from the
 * author's sources in `seed/source/` — `resume.md`, `job-search-prompt.md`
 * and `application-settings.md`. Nothing here is invented: a field the
 * sources do not state is `null` and resolves to user-only (D9, D11).
 * Compensation is never seeded; the salary floor is the API's optional
 * `SALARY_FLOOR_LPA` env var.
 *
 * Every rubric rule carries a `source` quote copied verbatim from the
 * job-search prompt (D6); `user.test.ts` checks each one against the file.
 */
import { APPLY_MIN_FIT, APPLY_NOW_MIN_FIT, FIT_CAP, type User } from "@auto-apply/shared";

const profile: User["profile"] = {
  fullName: "Shubham Muthreja",
  firstName: "Shubham",
  lastName: "Muthreja",
  email: "shubham@muthreja.com",
  phone: "+91-9566225447",
  location: "Gurugram, India",
  links: {
    linkedin: "https://linkedin.com/in/shubhammuthreja",
    github: "https://github.com/ShubhamMuthreja87",
    website: "https://shubham.muthreja.com",
  },
  headline: "Engineering Manager | AI Systems | Founder",
  summary:
    "Engineering Manager and founder with 6+ years building production systems at scale. Managed a team of 6 engineers at Digital Paani, scaling a real-time IoT platform from 4 pilot plants to 55+ facilities processing millions of records daily. Currently building Qurkle, a consumer app powered by MIRA, an LLM-based psychometric matching engine built in Python with FastAPI, LangChain, RAG, and vector embeddings. Open to EM, Tech Lead, and Staff Engineer roles at AI-first product companies.",
  experience: [
    {
      company: "Qurkle",
      title: "Co-Founder and CTO",
      start: "Feb 2025",
      end: null,
      highlights: [
        "Built MIRA, an LLM-powered psychometric matching engine in Python and FastAPI using LangChain, RAG, and 74-parameter vector profiles, matching users on deep personality signals rather than surface-level preferences.",
        "Shipped the complete product end to end: event creation, booking and ticketing flows, real-time notifications, and an analytics dashboard on AWS EC2 for reviewing 3000+ applications.",
        "Set up CI/CD and Play Store deployment; led a Flutter engineer on UI while owning the Python/FastAPI inference service and Node.js product API end to end, including infrastructure and performance profiling, with typical API response times of 200-300ms.",
        "Grew to 600+ accepted users, 200+ active on the production LLM pipeline, on a lean Rs 1.15L marketing budget.",
      ],
    },
    {
      company: "Digital Paani (Digital EcoInnovision)",
      title: "Engineering Manager",
      start: "Feb 2023",
      end: "Feb 2025",
      highlights: [
        "Managed a team of 6 engineers: hired, onboarded, and mentored across sprint planning, retrospectives, and performance reviews.",
        "Scaled the platform from 4 pilot plants to 55+ facilities with up to 1,000 sensors per plant, serving Delhi Jal Board, Amazon, Dr Reddy's, Reliance, and BPTP; the system halved on-site plant manpower requirements.",
        "Built a SCADA-like visual plant control system with the team using React Flow; drove code cleanup, latency reduction, and engineering standards across the codebase.",
        "Built an ML sludge settlement sensor end to end: YOLOv8 on edge Raspberry Pi over an RTSP camera feed, trained on a 100K+ image dataset to a 0.95 F1 score, with custom fabricated hardware for automated sampling and flushing. Deployed across 10+ plants and later productised as a standalone offering.",
        "Maintained zero data loss and roughly 5 hours total downtime per year across the fleet through instant rollbacks and AWS service alerting.",
      ],
    },
    {
      company: "Digital Paani",
      title: "Senior Software Developer",
      start: "Jun 2022",
      end: "Feb 2023",
      highlights: [
        "Took over the platform solo after the previous lead's exit; migrated the Mosquitto broker and Azure Tables stack to AWS Lambda ingestion, MongoDB time series, and EC2 with NGINX, eliminating per-plant broker servers and runaway storage costs.",
        "Built a real-time alert engine evaluating time-sliced conditions on live sensor data with instant WhatsApp alerts, auto-escalation, and auto-resolution; plants moved from manual register rounds to 10-15 preemptive alerts a day handled by half the staff.",
        "Designed a computed-sensor formula engine letting operators combine any sensors with arbitrary mathematical functions into virtual sensors, replacing manual Excel exports and synchronising readings from multiple Raspberry Pis per plant.",
        "Cut latency by 30% on ingestion pipelines handling millions of records/day; wrote minute/hour/day time-series aggregations and revamped the dashboard UI.",
        "The revamped platform was used as the demo product for the company's seed fundraise.",
      ],
    },
    {
      company: "BraynixAI",
      title: "Head of Software Development",
      start: "Feb 2021",
      end: "May 2022",
      highlights: [
        "Led two small cross-functional teams at an early-stage consultancy using Agile Scrum, running standups, sprint planning, and code review across frontend and backend squads.",
        "Cut bug-related delivery delays by 30% by introducing testing frameworks, release processes, and clearer development standards.",
        "Built and deployed client applications using React/Next.js, Node.js/Express, and AWS (S3, CloudFront, Lambda).",
      ],
    },
    {
      company: "SFC Transport Pvt. Ltd.",
      title: "Consultant, Full Stack Developer (part-time engagement)",
      start: "Mar 2021",
      end: "Feb 2022",
      highlights: [
        "Digitised a 300+ truck logistics business end to end for a family enterprise, moving operations, HR, accounts, and partner bidding from paper to a MERN platform with Flutter apps, preventing an estimated Rs 16L/year in losses from missing truck parts and unnoticed bids.",
        "Hired and led 3 developers; built a partner bidding marketplace handling requisitions for contracts with clients like PepsiCo and Blue Star.",
        "Built truck part tracking and a last-mile delivery tracking app alongside 12+ role-specific dashboards covering operations, HR, accounts, and franchise management.",
      ],
    },
    {
      company: "Numocity Technologies",
      title: "Software Engineer",
      start: "Aug 2019",
      end: "Nov 2020",
      highlights: [
        "Built the flagship Android app in Java, then rebuilt it in Flutter; 4 whitelabeled versions shipped live for enterprise clients on the EV charging SaaS.",
        "Built the battery swap flow (latch unlock, slot exchange) and implemented MQTT, LoRaWAN, and Bluetooth/Wi-Fi charger communication for weak-network environments.",
      ],
    },
  ],
  skills: [
    { category: "Languages", items: ["TypeScript", "Python", "JavaScript", "SQL"] },
    {
      category: "AI / LLM",
      items: ["LangChain", "RAG", "Vector Databases", "OpenAI API", "Ollama"],
    },
    { category: "Backend", items: ["FastAPI", "Node.js", "Express", "REST APIs", "Flutter"] },
    { category: "Frontend", items: ["React", "Next.js"] },
    {
      category: "Cloud / Infra",
      items: ["AWS Lambda", "IoT Core", "SQS", "EC2", "Docker", "CI/CD"],
    },
    { category: "Data", items: ["MongoDB", "MySQL", "Redis", "ClickHouse"] },
    { category: "Protocols", items: ["MQTT", "SSE", "WebSockets", "LoRaWAN"] },
  ],
  leadership: [
    "Managed a team of 6 engineers at Digital Paani: hiring, onboarding, mentoring",
    "Sprint planning, roadmap ownership, cross-functional alignment",
    "Founded Qurkle as CTO, leading product, engineering, and GTM from 0 to 1",
    "Owned technology selection across a polyglot stack: Python/FastAPI for LLM services, Node.js for product APIs",
    "Set up CI/CD, code review standards, and on-call processes from scratch",
  ],
  education: [
    {
      degree: "B.Tech in Software Engineering",
      school: "SRM University",
      startYear: 2015,
      endYear: 2019,
    },
  ],
};

const MANAGER_TITLES = [
  "Engineering Manager",
  "Engineering Lead",
  "Head of Engineering",
  "Tech Lead",
  "Technical Lead",
  "Team Lead",
];

const preferences: User["preferences"] = {
  region: "India",
  goal: {
    text: "Management and tech-lead roles first, senior/lead IC second.",
    source: "GOAL: management and tech-lead roles first, senior/lead IC second.",
  },
  location: {
    accepted: ["Delhi NCR", "Bengaluru", "Hyderabad", "Mumbai", "Pune", "Chennai"],
    remoteOpenTo: ["India"],
    source:
      "Locations accepted: Delhi NCR, Bengaluru, Hyderabad, Mumbai, Pune, Chennai, or remote open to India.",
  },
  stack: {
    strong: [
      "JavaScript",
      "TypeScript",
      "Node.js",
      "Express",
      "React",
      "Next.js",
      "MERN",
      "MongoDB",
      "AWS",
      "real-time/event-driven systems",
      "system design",
      "team leadership",
    ],
    workingKnowledge: [
      "Python",
      "FastAPI",
      "LangChain",
      "RAG",
      "LLM APIs",
      "SQL/PostgreSQL",
      "Redis",
      "Docker",
    ],
    not: [
      "Java",
      "Spring",
      "Go",
      "Rust",
      ".NET",
      "Angular",
      "Kubernetes",
      "ML training",
      "data science",
    ],
  },
  excludedTitles: {
    terms: [
      "sales",
      "QA",
      "data scientist",
      "ML engineer",
      "DevOps/SRE-only",
      "SAP/Salesforce",
      "Java/.NET/PHP developer",
      "intern",
      "fresher",
    ],
    source:
      "TITLES OUT OF TARGET (skip): sales, QA, data scientist, ML engineer, DevOps/SRE-only, SAP/Salesforce, Java/.NET/PHP developer, intern, fresher.",
  },
  companyBlocks: {
    categories: [
      {
        id: "it_services",
        label: "IT services, outsourcing and consulting firms at any size",
        companies: [
          "Accenture",
          "TCS",
          "Infosys",
          "Wipro",
          "HCLTech",
          "Tech Mahindra",
          "Cognizant",
          "Capgemini",
          "LTIMindtree",
          "Deloitte",
          "EY",
          "PwC",
          "KPMG",
          "IBM",
        ],
        source:
          "IT services/outsourcing/consulting firms at any size (Accenture, TCS, Infosys, Wipro, HCLTech, Tech Mahindra, Cognizant, Capgemini, LTIMindtree, Deloitte, EY, PwC, KPMG, IBM)",
      },
      {
        id: "banks",
        label:
          "Banks and financial institutions, incl. their tech/capability centres (fintech product companies are fine)",
        companies: [
          "JPMorgan",
          "Barclays",
          "Goldman Sachs",
          "Morgan Stanley",
          "Citi",
          "Wells Fargo",
          "HSBC",
          "Deutsche Bank",
          "American Express",
          "Bank of America",
          "UBS",
        ],
        source:
          "Banks and financial institutions incl. their tech/capability centres (JPMorgan, Barclays, Goldman Sachs, Morgan Stanley, Citi, Wells Fargo, HSBC, Deutsche Bank, American Express, Bank of America, UBS); fintech product companies are fine.",
      },
    ],
    allowedExceptions: {
      companies: [
        "Flipkart",
        "Myntra",
        "Swiggy",
        "Zomato",
        "PhonePe",
        "Paytm",
        "Ola",
        "Meesho",
        "Zepto",
        "Nykaa",
        "MakeMyTrip",
        "Zoho",
        "Freshworks",
        "Razorpay",
        "CRED",
        "Groww",
        "Spotify",
        "Booking.com",
        "Shopify",
        "Atlassian",
        "Mercari",
      ],
      source:
        "except strong product companies (e.g. Flipkart, Myntra, Swiggy, Zomato, PhonePe, Paytm, Ola, Meesho, Zepto, Nykaa, MakeMyTrip, Zoho, Freshworks, Razorpay, CRED, Groww; abroad: product-led tech firms like Spotify, Booking.com, Shopify, Atlassian, Mercari)",
    },
  },
  hardBlocks: [
    {
      id: "location",
      label: "Mandatory onsite outside the accepted locations, without relocation support",
      terms: [],
      threshold: null,
      source: "Mandatory onsite elsewhere without relocation support is a hard block.",
    },
    {
      id: "company_category",
      label: "Company in a blocked category (see company blocks)",
      terms: [],
      threshold: null,
      source: "COMPANY BLOCKS",
    },
    {
      id: "company_size",
      label: "Company with 10,000+ employees, unless an allowed product company",
      terms: [],
      threshold: 10000,
      source: "Companies with 10,000+ employees",
    },
    {
      id: "staffing_blocked_client",
      label: "Staffing agency naming a blocked client",
      terms: [],
      threshold: null,
      source: "Staffing agencies are allowed; if they name a blocked client, block.",
    },
    {
      // The floor itself comes from SALARY_FLOOR_LPA; inactive when unset.
      id: "salary_below_floor",
      label: "Pay shown and its maximum is below the floor; none shown never blocks",
      terms: [],
      threshold: null,
      source: "salary shown and its maximum is below the floor",
    },
    {
      id: "experience_minimum",
      label: 'Minimum experience required is 8+ years ("7-10" is fine)',
      terms: [],
      threshold: 8,
      source: 'experience minimum 8+ years ("7-10" is fine)',
    },
    {
      id: "team_size",
      label: "10+ direct reports, or manager of managers",
      terms: ["manager of managers", "manager-of-managers"],
      threshold: 10,
      source: "10+ direct reports or manager-of-managers",
    },
    {
      id: "employment_type",
      label: "Contract-only, part-time or freelance",
      terms: ["contract", "part-time", "freelance"],
      threshold: null,
      source: "contract-only, part-time or freelance",
    },
    {
      id: "role_family",
      label: "ML training, research, data science, MLOps, data engineering, QA or DevOps-only role",
      terms: [
        "ML training",
        "research",
        "data science",
        "MLOps",
        "data engineering",
        "QA",
        "DevOps",
      ],
      threshold: null,
      source: "ML training, research, data science, MLOps, data engineering, QA, DevOps-only roles",
    },
    {
      id: "ai_strategy_consulting",
      label: "AI strategy consulting",
      terms: ["AI strategy consulting"],
      threshold: null,
      source: "AI strategy consulting",
    },
  ],
  languageGate: [
    {
      id: "python_primary_ic",
      label: "Python-primary IC role",
      terms: ["Python"],
      cap: "APPLY",
      source: "Python-primary IC caps at APPLY.",
    },
    {
      id: "other_stack_or_mobile_ic",
      label: "Java/Go/Rust/.NET/Angular-first or mobile-only IC role",
      terms: ["Java", "Go", "Rust", ".NET", "Angular", "mobile"],
      cap: "STRETCH",
      source: "Java/Go/Rust/.NET/Angular-first or mobile-only IC goes to STRETCH.",
    },
    {
      id: "ai_titled_ic",
      label: "AI-titled IC role, unless the stack is JS/TS",
      terms: ["AI"],
      cap: "APPLY",
      source: "AI-titled IC roles cap at APPLY unless the stack is JS/TS.",
    },
  ],
  fitCriteria: [
    {
      id: "title_manager",
      label: "Manager title",
      weight: 3,
      group: "title",
      terms: MANAGER_TITLES,
      source:
        "+3 manager (Engineering Manager, Engineering Lead, Head of Engineering at startups, Tech Lead, Technical Lead, Team Lead)",
    },
    {
      id: "title_lead_ic",
      label: "Lead IC title",
      weight: 2,
      group: "title",
      terms: ["Staff", "Lead", "Principal", "Founding Engineer"],
      source: "+2 lead IC (Staff, Lead, Principal, Founding Engineer)",
    },
    {
      id: "title_senior_ic",
      label: "Senior IC title",
      weight: 1,
      group: "title",
      terms: ["Senior Software Engineer", "SDE 3", "Senior Full Stack", "Senior Backend"],
      source: "+1 senior IC (Senior Software Engineer, SDE 3, Senior Full Stack/Backend)",
    },
    {
      id: "stack_primary",
      label: "JS/TS/Node/React is the primary stack",
      weight: 3,
      group: "stack",
      terms: ["JavaScript", "TypeScript", "Node", "React"],
      source: "Stack: +3 JS/TS/Node/React primary",
    },
    {
      id: "stack_partial",
      label: "Partial stack overlap",
      weight: 1,
      group: "stack",
      terms: [],
      source: "else +1 partial overlap",
    },
    {
      id: "realtime_data",
      label: "Real-time, IoT or high-volume data",
      weight: 1,
      group: null,
      terms: ["real-time", "IoT", "high-volume"],
      source: "+1 real-time/IoT/high-volume data",
    },
    {
      id: "hands_on_leadership",
      label: "Hands-on leadership",
      weight: 1,
      group: null,
      terms: ["hands-on"],
      source: "+1 hands-on leadership",
    },
    {
      id: "startup",
      label: "Startup or scale-up",
      weight: 1,
      group: null,
      terms: ["startup", "scale-up"],
      source: "+1 startup/scale-up",
    },
    {
      id: "experience_band",
      label: "Experience band within 5-9 years",
      weight: 1,
      group: null,
      terms: [],
      source: "+1 experience band within 5-9 years",
    },
    {
      id: "llm_features",
      label: "LLM features in the product (bonus only)",
      weight: 1,
      group: null,
      terms: ["LLM"],
      source: "+1 LLM features in product (bonus only)",
    },
    {
      id: "pure_people_management",
      label: "Pure people management",
      weight: -1,
      group: null,
      terms: [],
      source: "-1 pure people management",
    },
    {
      id: "ic_unused_stack",
      label: "IC role in a stack he does not use",
      weight: -2,
      group: null,
      terms: [],
      source: "-2 IC in a stack he does not use",
    },
  ],
  fitCap: FIT_CAP,
  verdictBands: {
    applyNowMinFit: APPLY_NOW_MIN_FIT,
    applyMinFit: APPLY_MIN_FIT,
    source: "APPLY NOW = fit 7+ with no gaps. APPLY = fit 5-6, or 7+ with minor gaps.",
  },
  tierFraming: {
    manager: "EM",
    ic: "Staff",
    source: "manager titles -> EM framing; IC titles -> Staff framing",
  },
};

const settings: User["settings"] = {
  // The author's real preferences; "demo" is only ever chosen in Settings.
  preferencesPreset: "default",
  location: {
    current: "Gurugram, India",
    postalAddress: null,
    willingToRelocate: true,
    relocationScope: "anywhere in India",
    workArrangement: "remote",
    workAuthorizationCountries: ["India"],
    requiresVisaSponsorship: false,
    citizenship: null,
  },
  availability: {
    noticePeriodDays: 30,
    // The source writes "1/11/26"; read day-first (Indian convention).
    earliestStartDate: "2026-11-01",
  },
  education: {
    highestDegree: "B.Tech in Software Engineering",
    school: "SRM University",
    graduationYear: 2019,
  },
  experience: {
    totalYears: 7,
    peopleManagementYears: 5,
    largestTeamManaged: 6,
  },
  documents: {
    resumeUrl: null,
    coverLetter: null,
  },
  other: {
    howDidYouHear: "LinkedIn",
    pronouns: "he/him",
  },
  alwaysUserOnly: [
    "compensation",
    "legal_agreements",
    "ai_policy_acknowledgements",
    "consent",
    "demographic",
  ],
};

/** The seed without its uid; `seedUser` stamps the uid it is seeding. */
export const SEED_USER: Omit<User, "uid"> = { profile, preferences, settings };
