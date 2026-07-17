# DATA_NOTES.md - Synthetic Multi-Provider Liquidity & Risk Intelligence Platform

## 1. Generation Methodology & Architectural Philosophy
The synthetic data for this prototype is designed to mimic the exact structural conditions of a real multi-agent mobile financial services (MFS) shop operating in Bangladesh. 

*   **Multi-Provider Balances**: Each agent shop maintains three isolated e-money accounts (bKash, Nagad, and Rocket) representing three independent payment networks.
*   **Physical Cash Drawer**: The agent shop maintains exactly **one shared physical cash drawer**. It is the central physical liquidity source of the shop. Physical cash and digital e-money are in constant opposition:
    *   **Cash-In (Deposits)**: Customer hands cash to the agent. Digital e-money balance decreases; cash drawer balance increases.
    *   **Cash-Out (Withdrawals)**: Customer requests cash withdrawal. Digital e-money balance increases; cash drawer balance decreases.
*   **Operating Hours**: 08:00 to 22:00. Outside of these hours, activity is highly sparse (simulated 5% probability of overnight offline processing).
*   **Time Span**: 2 full years (from **2024-07-17** to **2026-07-17**) generated in realistic sub-hour event granularities to support robust temporal, weekly, monthly, and holiday training patterns.

---

## 2. Seasonal Demand Patterns & Multipliers
To ensure the dataset represents the authentic commercial reality of Bangladesh, the following multipliers are applied:

| Seasonal Vector | Type | Specific Range / Condition | Multiplier Effect | Commercial Context |
| :--- | :--- | :--- | :--- | :--- |
| **Weekly** | Peak | Thursday Afternoons (Day 4) | **1.40x** | Last working day of the week in Bangladesh; people traveling home. |
| **Weekly** | Peak | Friday (Day 5) | **1.25x** | Weekend peak retail traffic and community gatherings. |
| **Weekly** | Trough | Sunday (Day 0) | **0.85x** | First working day; slow retail transaction speed. |
| **Monthly** | Peak | 1st to 5th of every month | **1.50x** | Salary disbursement cycle; heavy Cash-Out pressure as physical cash is drawn. |
| **Monthly** | Trough | 25th to 30th of every month | **0.75x** | Pre-salary liquidity drought. |
| **Festival** | Extreme Peak | Eid-ul-Fitr / Eid-ul-Adha Peaks | **4.50x** | Eid day and adjacent national holidays. High physical cash depletion. |
| **Festival** | High Peak | 5 Days Leading Up to Eid | **2.0x - 3.6x** | Extreme velocity of Cash-Out for festival preparation, travel, and shopping. |

### Hijri-to-Gregorian Conversion Methodology
Islamic festivals shift approximately **10-12 days earlier** each Gregorian year due to the lunar cycles (354/355-day year). For this 2-year simulation, we mapped the official local sighting-based dates determined by the **Islamic Foundation of Bangladesh**:
1.  **Eid-ul-Fitr 2024 (Hijri 1445)**: April 10 - April 12, 2024 (Peak: **April 11, 2024**)
2.  **Eid-ul-Adha 2024 (Hijri 1445)**: June 16 - June 18, 2024 (Peak: **June 17, 2024**)
3.  **Eid-ul-Fitr 2025 (Hijri 1446)**: March 30 - April 1, 2025 (Peak: **March 31, 2025**)
4.  **Eid-ul-Adha 2025 (Hijri 1446)**: June 6 - June 8, 2025 (Peak: **June 7, 2025**)
5.  **Eid-ul-Fitr 2026 (Hijri 1447)**: March 19 - March 21, 2026 (Peak: **March 20, 2026**)
6.  **Eid-ul-Adha 2026 (Hijri 1447)**: May 26 - May 28, 2026 (Peak: **May 27, 2026**)

---

## 3. Labeled Ground-Truth Anomalies Log
A total of **40 distinct ground-truth anomaly runs** have been injected programmatically across the dataset. These serve as the "answer key" to validate predictive rules and compliance algorithms.

> [!NOTE]
> **Row Count Explanation**: Because an anomaly run is comprised of multiple contiguous transactions (e.g., a `repeated_amount` consists of a sequence of 5 identical max-limit cash-outs, and a `sudden_burst` covers 12 consecutive rapid transactions), the total number of individual transaction rows marked `is_ground_truth_anomaly = true` in the physical ledger files is exactly **216 rows** across the 22,482 total transactions.

### Anomaly Definitions & Types
1.  **`repeated_amount` (8 instances)**:
    *   *Description*: A rapid sequence (within 20 mins) of 5 consecutive identical transactions of maximum limit (25,000 BDT) on the same agent.
    *   *Indicator*: Structuring, smurfing, or potential ledger manipulation.
2.  **`sudden_burst` (8 instances)**:
    *   *Description*: A sudden high-velocity burst of 12 Cash-Out transactions within 45 minutes on a single agent, completely draining the cash drawer below operating safety margins.
    *   *Indicator*: System panic, fraud loop, or a localized cash run.
3.  **`provider_concentration` (8 instances)**:
    *   *Description*: A 2-hour window where 100% of the agent's cash flow concentrates on a single MFS provider (specifically Nagad), with zero transactions on bKash/Rocket.
    *   *Indicator*: Promotion loop abuse, localized commission arbitrage, or provider system failures forcing customers to one network.
4.  **`feed_delay` (8 instances)**:
    *   *Description*: A transaction completed at 23:30 (night) is delayed and only written/logged in the data feed at 08:30 the next morning.
    *   *Indicator*: Offline execution, synchronization lag, or deliberate delay in recording balances.
5.  **`feed_conflict` (8 instances)**:
    *   *Description*: A balance mismatch where transaction $N+1$ lists an `opening_balance` that is substantially lower (discrepancy of 50,000 BDT) than the `current_balance` of transaction $N$.
    *   *Indicator*: Unauthorized ledger alteration, split-second account spoof, or deep provider feed integration bugs.

---

## 4. Synthetic Data Disclaimer
> [!WARNING]
> **COMPLIANCE & RISK DISCLAIMER**: All datasets generated in this platform (`bkash.csv`, `nagad.csv`, `rocket.csv`, `cash_drawer_ledger.csv`, and `users.json`) are 100% synthetic, compiled using static mathematical models and pseudorandom seeds. 
> *   No real customer names, transactions, accounts, private phone numbers, or active MFS balances are represented.
> *   All agent IDs, locations, and transactions are fabricated tokens.
> *   Risk signals and anomalies surfaced by this application are Advisory Only. They do not constitute a final determination of fraudulent or criminal activity. This tool is built strictly as a Decision-Support System for human reviewers.
