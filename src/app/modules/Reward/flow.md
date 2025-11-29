```marmaid
graph TD
subgraph Business
A[Start: Creates a new Reward] --> B{Fills out details <br/> title, description, etc.};
B --> C[Sets 'redemptionLimit' and adds 'codes' if online];
end

    subgraph System
        C --> D[Creates new 'Reward' document];
        D --> E[Initializes 'redeemedCount' = 0, <br/> 'remainingCount' = 'redemptionLimit'];
        E --> F[Saves 'Reward' to DB];
    end

    subgraph User
        G[Browses Available Rewards] --> H{Selects a Reward to Claim};
    end

    subgraph System
        F -- Available for Claiming --> G;
        H --> I{Finds 'Reward' and calls checkAvailability()};
        I -- Available --> J[Creates new 'RewardRedemption' document];
        I -- Not Available --> K[Shows 'Unavailable' to User];
        J --> L[Links to 'User', 'Reward', 'Business'];
        L --> M[Sets status 'CLAIMED', <br/> 'claimedAt' & 'expiresAt'];
        M --> N{Is it an online reward?};
        N -- Yes --> O[Finds an available code in 'Reward.codes'];
        O --> P[Marks code as used in 'Reward' document];
        N -- No --> Q[Generates QR Code data];
        P --> R;
        Q --> R;
        R[Updates 'Reward' document: <br/> 'redeemedCount'++ <br/> 'remainingCount'--];
        R --> S[Saves both 'RewardRedemption' and updated 'Reward'];
        S --> T[Reward is now 'CLAIMED' and in user's wallet];
    end

    subgraph UserStaff[User / Staff]
        T --> U{Action on Claimed Reward};
        U -- Presents for Use --> V[Redeems Reward <br/> in-store or online];
        U -- Changes Mind --> W[Cancels Reward];
    end

    subgraph System
        V --> X{Finds 'RewardRedemption' <br/> and validates status};
        X -- Valid: CLAIMED --> Y[Calls markAsRedeemed()];
        Y --> Z[Updates 'RewardRedemption': <br/> status 'REDEEMED', 'redeemedAt', 'redeemedByStaff'];
        Z --> AA[Saves 'RewardRedemption'];
        AA --> END_REDEEMED[End: Reward Redeemed];

        W --> BB{Finds 'RewardRedemption' <br/> and validates status};
        BB -- Valid: CLAIMED --> CC[Calls cancel()];
        CC --> DD[Updates 'RewardRedemption': <br/> status 'CANCELLED', 'cancelledAt'];
        DD --> EE[Updates 'Reward': <br/> 'redeemedCount'--, 'remainingCount'++];
        EE --> FF[Returns code to pool (online rewards only)];
        FF --> GG[Refunds points to User];
        GG --> HH[Saves both documents];
        HH --> END_CANCELLED[End: Reward Cancelled];

        T --> II[Background Job: expireOldClaims()];
        II --> JJ[Finds expired CLAIMED redemptions];
        JJ --> KK[Updates 'RewardRedemption': <br/> status 'EXPIRED', 'expiredAt'];
        KK --> LL[Saves 'RewardRedemption'];
        LL --> END_EXPIRED[End: Reward Expired];
    end

    style Business fill:#e6f3ff,stroke:#007bff,stroke-width:2px
    style UserStaff fill:#e6ffe6,stroke:#28a745,stroke-width:2px
    style System fill:#fff5e6,stroke:#ffc107,stroke-width:2px
```
