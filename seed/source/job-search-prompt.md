# Job-search rubric (source for preferences, hard blocks and scoring, D6)

Adapted from the author's own daily LinkedIn/Naukri job-scan prompt. The browsing, Notion and site-specific parts were removed; the matching rules below are the author's original wording. The salary floor is not stored here: it is read from the optional env var `SALARY_FLOOR_LPA`, and the salary hard block is inactive when it is unset.

REGION = India. Locations accepted: Delhi NCR, Bengaluru, Hyderabad, Mumbai, Pune, Chennai, or remote open to India. Mandatory onsite elsewhere without relocation support is a hard block.

CANDIDATE: Shubham Muthreja, Gurugram India. About 7 years experience (career start Aug 2019). Engineering Manager at Digital Paani 2023-2025 with a team of 6 (real-time IoT platform scaled from 4 to 55+ plants, AWS Lambda, SQS, MongoDB). Co-Founder & CTO of Qurkle 2025-present (Node.js/TypeScript product API; LLM matching engine in Python/FastAPI built largely with AI assistance). Available immediately. GOAL: management and tech-lead roles first, senior/lead IC second.
STRONG: JavaScript, TypeScript, Node.js, Express, React, Next.js, MERN, MongoDB, AWS, real-time/event-driven systems, system design, team leadership.
WORKING KNOWLEDGE: Python, FastAPI, LangChain, RAG, LLM APIs, SQL/PostgreSQL, Redis, Docker.
NOT: Java, Spring, Go, Rust, .NET, Angular, Kubernetes, ML training, data science.

TITLES OUT OF TARGET (skip): sales, QA, data scientist, ML engineer, DevOps/SRE-only, SAP/Salesforce, Java/.NET/PHP developer, intern, fresher.

COMPANY BLOCKS: IT services/outsourcing/consulting firms at any size (Accenture, TCS, Infosys, Wipro, HCLTech, Tech Mahindra, Cognizant, Capgemini, LTIMindtree, Deloitte, EY, PwC, KPMG, IBM). Banks and financial institutions incl. their tech/capability centres (JPMorgan, Barclays, Goldman Sachs, Morgan Stanley, Citi, Wells Fargo, HSBC, Deutsche Bank, American Express, Bank of America, UBS); fintech product companies are fine. Companies with 10,000+ employees, except strong product companies (e.g. Flipkart, Myntra, Swiggy, Zomato, PhonePe, Paytm, Ola, Meesho, Zepto, Nykaa, MakeMyTrip, Zoho, Freshworks, Razorpay, CRED, Groww; abroad: product-led tech firms like Spotify, Booking.com, Shopify, Atlassian, Mercari). Staffing agencies are allowed; if they name a blocked client, block.

HARD BLOCKS: salary shown and its maximum is below the floor; experience minimum 8+ years ("7-10" is fine); 10+ direct reports or manager-of-managers; contract-only, part-time or freelance; ML training, research, data science, MLOps, data engineering, QA, DevOps-only roles; AI strategy consulting. No salary shown is never a reason to block.

LANGUAGE GATE (IC titles only, never manager titles): JS/TS/Node/React primary is normal. Python-primary IC caps at APPLY. Java/Go/Rust/.NET/Angular-first or mobile-only IC goes to STRETCH. AI-titled IC roles cap at APPLY unless the stack is JS/TS.

FIT 1-10 (cap 10): title, highest only: +3 manager (Engineering Manager, Engineering Lead, Head of Engineering at startups, Tech Lead, Technical Lead, Team Lead); +2 lead IC (Staff, Lead, Principal, Founding Engineer); +1 senior IC (Senior Software Engineer, SDE 3, Senior Full Stack/Backend). Stack: +3 JS/TS/Node/React primary, else +1 partial overlap. +1 real-time/IoT/high-volume data. +1 hands-on leadership. +1 startup/scale-up. +1 experience band within 5-9 years. +1 LLM features in product (bonus only). -1 pure people management. -2 IC in a stack he does not use.

VERDICT: APPLY NOW = fit 7+ with no gaps. APPLY = fit 5-6, or 7+ with minor gaps. STRETCH and hard blocks are not applied to.

TIER FRAMING (D12): manager titles -> EM framing; IC titles -> Staff framing.