┌─────────────────────────────────────────────────────────────────────────────────────┐
│ SIMPLIFIED PAYOUT SYSTEM - 3 NEW MODELS │
└─────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────────────┐
                                    │                         │
                                    │      Organization       │
                                    │                         │
                                    │  + stripeConnectId      │
                                    │
                                    │  + customFeeRate        │
                                    │  + minimumPayoutAmount  │
                                    │                         │
                                    └────────────┬────────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    │ 1:1                        │ 1:N                        │ 1:N
                    ▼                            ▼                            ▼
     ┌──────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
     │                          │  │                          │  │                          │
     │   OrganizationBalance    │  │   BalanceTransaction     │  │         Payout           │
     │                          │  │      (LEDGER)            │  │                          │
     │  • pendingBalance        │  │                          │  │  • payoutNumber          │
     │  • availableBalance      │  │  • type                  │  │  • requestedAmount       │
     │  • reservedBalance       │  │  • category              │  │  • platformFeeAmount     │
     │  • pendingByType         │  │  • amount                │  │  • taxAmount             │
     │  • availableByType       │  │  • balanceAfter          │  │  • netAmount             │
     │  • lifetimeEarnings      │  │  • donationType          │  │  • status                │
     │  • lifetimePaidOut       │  │  • donation (ref)        │  │  • scheduledDate         │
     │                          │  │  • payout (ref)          │  │  • stripeTransferId      │
     └──────────────────────────┘  │                          │  │                          │
                                   └─────────────┬────────────┘  └─────────────┬────────────┘
                                                 │                             │
                                                 │ N:1                         │ 1:N
                                                 ▼                             │
                                   ┌──────────────────────────┐                │
                                   │                          │                │
                                   │        Donation          │                │
                                   │                          │◄───────────────┘
                                   │  • amount                │      (via BalanceTransaction)
                                   │  • donationType          │
                                   │  • status                │
                                   │                          │
                                   └──────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────┐
│ RELATIONSHIPS │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ │
│ Organization (1) ◄─────────────────────────────────────────► (1) OrganizationBalance│
│ │ │
│ │ (1) ◄───────────────────► (N) BalanceTransaction ◄────────► (1) Donation │
│ │ ▲ │
│ │ (1) ◄───────────────────► (N) Payout ─────────────────────► (N) BalanceTxn │
│ │
└─────────────────────────────────────────────────────────────────────────────────────┘
