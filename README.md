# FlowSense

FlowSense is a full-stack security and analytics application designed to provide visibility into financial transaction data across multiple providers (e.g., bKash, Nagad, Rocket). It enables real-time monitoring of transaction streams, anomaly detection, security auditing, and intelligent analysis.

## Core Features

- **Live Security Audits Stream**: Immutable, time-stamped, and signed audit trails for all transaction accesses.
- **Anomaly Detection Dashboard**: Real-time monitoring and alerting for unusual transaction patterns (e.g., structuring, velocity bursts, unusual volume).
- **Liquidity Forecast Dashboard**: Analytical insights into liquidity trends based on transaction data.
- **Sandbox Simulator**: Tools to simulate transaction sequences and test detector parameters in a controlled environment.
- **AI Copilot**: Intelligent analysis and reporting powered by server-side Gemini integration.

## Architecture

FlowSense utilizes a full-stack architecture:
- **Frontend**: React application built with Vite and Tailwind CSS.
- **Backend**: Express.js server providing API routes, data processing, and anomaly detection.
- **Security**: Token-based authentication and immutable audit logging.

## Getting Started

1.  **Installation**: Ensure dependencies are installed via `npm install`.
2.  **Environment Setup**: Copy `.env.example` to `.env` and configure required variables.
3.  **Running the Application**:
    -   Development: `npm run dev`
    -   Build: `npm run build`
    -   Production Start: `npm run start`

## License

Confidential.
