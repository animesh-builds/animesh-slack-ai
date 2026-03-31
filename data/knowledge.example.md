# Payments — Checkout & Payment Flow

Ecommerce checkout supports multiple payment methods: UPI, cards (credit/debit), net banking, wallets, BNPL (Buy Now Pay Later), and COD (Cash on Delivery).

Payment orchestration layers sit between the merchant and multiple payment gateways to route, retry, and optimise success rates.

Key checkout concerns:
- Payment success rate (PSR) — primary north star metric
- Drop-off at payment step
- Retry flows for failed payments
- UPI intent vs collect flow differences
- Card tokenisation compliance

# Payments — Failure Handling & Refunds

Common failure reasons: bank decline, insufficient funds, timeout, gateway error, network drop.

Retry logic: show contextual error, suggest alternate payment method, allow retry on same method.

Auto-refund SLA for failed-but-charged scenarios is a critical compliance and trust requirement.

Refund flows back to original payment method. Key metrics: refund initiation TAT, refund success rate.

# Payments — Reconciliation

Daily reconciliation between:
- Orders placed on platform
- Payments captured at gateway
- Settlements received from gateway
- Payouts made to sellers/brands

# Payments — Fraud and Risk

Velocity checks, device fingerprinting, address verification. COD abuse (false returns, fake orders) is a specific ecommerce fraud vector.

# Billing & Subscriptions — SaaS Model

SaaS platform billing charges customers on a subscription model. Plans vary by feature access, usage tiers, and billing cycles.

# Billing — Subscription Lifecycle

Key states: Trial → Active → Past Due → Suspended → Cancelled

- Trial: free period for new users
- Past Due: payment failed, grace period before suspension
- Suspended: access restricted, reactivate by paying

# Billing — Dunning

Process to recover failed subscription payments:
- Retry schedule: Day 0 → Day 3 → Day 7 → suspension
- Communication: email + in-app notifications at each retry
- Key metric: involuntary churn — churn caused by payment failure, not intent to cancel

# PM Frameworks

## North Star and Metrics
- PSR (Payment Success Rate) for payments
- MRR, involuntary churn, trial-to-paid conversion for subscriptions

## Product Philosophy
- Start with user problems before jumping to solutions
- Data-informed (not data-driven) — qualitative signals matter
- Build for trust in financial products — transparency and error handling are non-negotiable

# Tools Reference

Product: Jira, Confluence, Figma, Notion, Linear, Slack
Analytics: SQL, Mixpanel, Amplitude, Looker, Metabase
Engineering: REST APIs, webhooks, event-driven architecture
