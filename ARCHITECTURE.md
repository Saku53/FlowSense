# ARCHITECTURE.md - Cross-Provider Privacy & Security Architecture

## 1. Schema-Level Tenant Isolation
To prevent unauthorized leakage of proprietary customer details, transactions, or account balances between competing providers (bKash, Nagad, and Rocket), this platform enforces a strict privacy boundary at the database and ingestion levels.

```
       +------------------ PRIVATE PROVIDER SCHEMAS ------------------+
       |                                                              |
       |  [ bKash DB / CSV ]     [ Nagad DB / CSV ]   [ Rocket DB / CSV ]
       |          |                      |                     |      |
       |    bKashAdapter           NagadAdapter          RocketAdapter|
       |          |                      |                     |      |
       +----------|----------------------|---------------------|------+
                  |                      |                     |
                  +-----------+          |          +----------+
                              |          |          |
                              v          v          v
                  +--------------------------------------------+
                  |    AGGREGATION-ONLY CROSSING SERVICE       |
                  |  - Only derived risk scores cross boundary |
                  |  - Raw transactions or PII NEVER escape    |
                  |  - Writes to Immutable Audit Log on access |
                  +--------------------------------------------+
                                        |
                                        v
                            [ Cross-Provider UI View ]
```

### Isolation Implementation
*   **Physical Segregation**: Data is stored in separate physical files (`bkash.csv`, `nagad.csv`, `rocket.csv`).
*   **Software Isolation**: The backend instantiates isolated `ProviderAdapter` classes. No database connection or query is allowed to span multiple files.
*   **Enforced Access Controls**: A single-tenant provider token (e.g. `bKash Ops`) is cryptographically restricted inside the API route handler. It can only call the specific `bKashAdapter`, throwing a `403 Forbidden` if it attempts to interface with any other provider data.

---

## 2. Aggregation-Only Crossing Point
The only path where multiple provider dimensions are ever unified is the **Aggregation Service**. This service operates under the following strict rules:

1.  **No Raw Line-Item Exposure**: It never retrieves, returns, or processes raw individual transactions across the boundary.
2.  **Derived Sign Metrics Only**: It only computes high-level, anonymized statistics:
    *   *Volume & Count Trends*: Total transaction count or volume as an aggregated percentage or relative trend.
    *   *Liquidity Pressure Level*: Scaled pressure percentage (0% to 100%) indicating how close the agent's cash drawer or digital e-money is to depletion.
    *   *Risk & Anomaly Indices*: A 0.0 to 1.0 probability indicating unusual activity, without including individual transaction IDs or customer account identifiers.

---

## 3. Tokenization & Anonymization
To ensure absolute data protection and prevent cross-provider identity linking (which could expose a user's multi-wallet activity without their consent):
*   **Account Tokens**: All customer identifiers are replaced with synthetic cryptographic tokens (e.g., `ACC-00042`, `ACC-01294`) scoped explicitly to a single MFS provider. 
*   **No Cross-Provider Joins**: A token like `ACC-00042` under bKash has absolutely no relationship to a token of the same name under Nagad or Rocket. There are no shared keys or relational joins across provider tables.

---

## 4. Immutable Audit Logging
Any transaction or aggregation request that crosses the security perimeter is logged in an audit log file (`audit_log.csv`). This creates an immutable history for regulatory compliance and audit trails.

### Audit Record Schema
Every entry in the audit log captures:
*   `audit_id`: A unique UUID.
*   `timestamp`: Precision ISO 8601 UTC timestamp of the request.
*   `username`: The authenticated username (from JWT claims).
*   `role`: The RBAC role of the caller.
*   `action`: The requested action (e.g., `READ_AGGREGATED_LIQUIDITY`).
*   `scope`: The provider or shop scope of the query.
*   `status`: Success (`200 OK`) or failure (`403 FORBIDDEN`).
*   `hash`: A cryptographic signature of the log entry to guarantee immutability and tamper-detection.

---

## 5. Streaming Anomaly Detection & Case Coordination Workflow

The platform integrates a stateless, $O(1)$-amortized streaming anomaly detection pipeline on top of the isolated multi-tenant databases. It surfaces unusual activity and drives coordination without ever compromising provider privacy boundaries or human review safeguards.

```
       [ Incoming Transaction Stream ]
                     |
                     v
   +------------------------------------+
   |     StreamingAnomalyDetector       |
   | - P² Quantile Estimator (Median)   | <--- Isolated baselines lookup
   | - Welford online variance tracker  |      for seasonal demand cycles
   | - Velocity/Concentration buffers   |
   +------------------------------------+
                     |
                     v
             (Anomaly Flagged)
                     |
                     v
       +----------------------------+
       |   Case Coordination Hub    |
       |  - /anomalies/recent       |
       |  - /alerts/:id/evidence    |
       |  - /alerts/:id/acknowledge | <--- RBAC boundary enforcement
       |  - /alerts/:id/escalate    |      (Management: aggregate only;
       |  - /alerts/:id/resolve     |       Provider: competitor isolated)
       +----------------------------+
                     |
                     v
       (Acknowledge / Escalate / Resolve)
         |                        |
         v                        v
 [ Append Audit History ]  [ Sync status in CSV ]
```

### 5.1. Mathematical Estimators (Streaming & Stateless)
The engine does not perform heavy historical database queries per incoming transaction. Instead, it processes transactions as they arrive using high-performance, stateless online math estimators:
1.  **P² Quantile Tracker (Jain & Chlamtac)**: Tracks the running median and Median Absolute Deviation (MAD) of transaction sizes with fixed-memory $O(1)$ updates, making it completely resilient to extreme spikes without maintaining history.
2.  **Welford's Online Algorithm**: Computes running mean and variance incrementally with optimal numerical stability.
3.  **Seasonally-Adjusted Z-Scores**: Compares recent rate deviations against the baseline expectations calculated in Phase 2. Transactions exceeding a Z-score threshold of $3.5$ are flagged.
4.  **Ring Buffer Velocity Checkers**: Tracks provider volume concentration and transaction repetitions within small sliding windows (e.g., 5-transaction buffers) to identify velocity attacks or structural evasion of regulatory limits.

### 5.2. Role-Based Case Visibility (RBAC) & Tenant Isolation
The coordination endpoints strictly enforce the privacy model:
*   **Central Risk Analyst / Compliance**: Has global visibility across all alerts and evidence.
*   **Provider Ops (e.g., bKash Ops)**: Restricting visibility to their scoped provider ONLY. Any query to `/alerts/:alert_id/evidence` belonging to Nagad or Rocket returns `403 Forbidden`.
*   **Agent (Shop Operator)**: Can only see and acknowledge alerts belonging specifically to their own shop's agent ID.
*   **Management (Oversight)**: Restricted strictly to **aggregate-only rollups**. Running `/anomalies/recent` for a Management user returns summary metrics only, with the detailed row items array blanked out.

### 5.3. Case Coordination & Database Synchronization
When a compliance action (Acknowledge, Escalate, or Resolve) is submitted via a signed route:
1.  **Immutable History Logging**: The action, actor, timestamp, and human-input justification notes are appended to the alert's `auditable_history` list.
2.  **MFS Transaction Sync**: The associated transaction's `case_status` is updated in-memory and synchronized back to the respective physical file (e.g., `bkash.csv`) using the authenticated role signature.
3.  **Auditable Perimeter Protection**: A signed cryptographic audit trail entry is emitted, binding the operator's decision directly to the case history.

