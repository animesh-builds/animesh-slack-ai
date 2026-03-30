# Payments — Checkout & Payment Flow

Ecommerce checkout supports multiple payment methods: UPI, cards (credit/debit), net banking, wallets (Paytm, PhonePe etc.), BNPL (Buy Now Pay Later), and COD (Cash on Delivery).

Payment orchestration layers (e.g. Juspay) sit between the merchant and multiple payment gateways (Razorpay, PayU, etc.) to route, retry, and optimise success rates.

Key checkout concerns:
- Payment success rate (PSR) — primary north star metric
- Drop-off at payment step
- Retry flows for failed payments
- UPI intent vs collect flow differences
- Card tokenisation (RBI mandate compliance)

# Payments — Failure Handling & Refunds

Common failure reasons: bank decline, insufficient funds, timeout, gateway error, network drop.

Retry logic: show contextual error, suggest alternate payment method, allow retry on same method.

Auto-refund SLA for failed-but-charged scenarios is a critical compliance and trust requirement.

Refund flows back to original payment method. Key metrics: refund initiation TAT, refund success rate, refund to source vs wallet credit.

RBI mandates: card refunds within 5-7 business days, UPI refunds within 24-48 hours typically.

# Payments — Reconciliation

Daily reconciliation between:
- Orders placed on platform
- Payments captured at gateway
- Settlements received from gateway
- Payouts made to sellers/brands

Reconciliation breaks (mismatches) are a major ops pain point — tracked and resolved by finance ops.

# Payments — MDR and Costs

MDR (Merchant Discount Rate) — fee charged for accepting card payments. Varies by card type:
- Debit card: lower MDR
- Credit card: higher MDR (~1.5-2%)
- UPI: 0% MDR for P2M (NPCI mandate)

# Payments — Fraud and Risk

Velocity checks, device fingerprinting, address verification. COD abuse (false returns, fake orders) is a specific ecommerce fraud vector. RTO (Return to Origin) rate is a key metric tied to fraud and order quality.

# Billing & Subscriptions — SaaS Model

SaaS platform billing charges merchants on a subscription model. Plans vary by:
- Number of products/SKUs
- Number of sales channels
- Feature access
- GMV-based tiers in some cases

# Billing — Subscription Lifecycle

Key states: Trial → Active → Past Due → Suspended → Cancelled

- Trial: free period for new merchants, typically 14-30 days
- Past Due: payment failed, grace period before suspension
- Suspended: access restricted, reactivate by paying
- Cancellation: data retention policies apply

# Billing — Invoicing and Proration

Monthly/annual billing cycles. Invoice generation, tax (GST) calculation, payment collection via auto-debit or manual payment link.

Key pain points: invoice disputes, GST credit note handling, failed auto-debit retries.

Proration logic (upgrades mid-cycle, downgrades) is complex — common source of billing bugs and merchant complaints.

Upgrades: typically immediate + prorated charge for remainder of cycle.
Downgrades: typically applied at end of current billing cycle.

# Billing — Dunning

Process to recover failed subscription payments:
- Retry schedule: Day 0 → Day 3 → Day 7 → suspension
- Communication: email + in-app notifications at each retry
- Key metric: involuntary churn — churn caused by payment failure, not intent to cancel

# PM Frameworks

## North Star and Metrics
- PSR (Payment Success Rate) for payments
- Refund TAT, recon break rate for payment ops
- MRR, involuntary churn, trial-to-paid conversion for subscriptions
- Invoice dispute rate for billing health

## Product Philosophy
- Start with user/merchant problems before jumping to solutions
- Data-informed (not data-driven) — qualitative signals matter
- Build for trust in financial products — transparency and error handling are non-negotiable
- Ship small, learn fast in checkout; move deliberately in billing (mistakes are hard to reverse)
- Written specs before building — decisions documented, not verbal

# Tools Reference

Product: Jira, Confluence, Figma, Notion, Linear, Slack
Analytics: SQL, Mixpanel, Amplitude, Looker, Metabase
Payments: Razorpay dashboard, Juspay dashboard, reconciliation sheets
Engineering: REST APIs, webhooks (payment callbacks), event-driven architecture
