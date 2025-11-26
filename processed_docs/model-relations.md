# Model Relations - Visual Representation

This document provides a comprehensive view of all relationships between models in the Crescent Change platform, including visual diagrams and relationship descriptions.

---

## 1. Core User Relationships

### 1.1 Authentication & Profile Structure

```
┌─────────────┐
│    Auth     │
│  (Central)  │
└──────┬──────┘
       │
       ├─────────────────┬──────────────────┐
       │                 │                  │
       │ 1:1             │ 1:1              │ 1:1
       │                 │                  │
┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────────┐
│   Client    │   │  Business   │   │  Organization  │
│  (Donor)    │   │             │   │   (Charity)     │
└─────────────┘   └─────────────┘   └─────────────────┘
```

**Relationship Details:**

- `Auth` → `Client`: One-to-One (unique constraint)
- `Auth` → `Business`: One-to-One
- `Auth` → `Organization`: One-to-One
- Each Auth record can only link to ONE profile type

---

## 2. Donation System Relationships

### 2.1 Donation Flow

```
┌─────────────┐          ┌──────────────┐
│   Client    │          │    Cause     │
│  (Donor)    │          │ (Catalog)    │
└──────┬──────┘          └──────┬───────┘
       │                        │
       │ 1:N (one donor, many   │ N:M (org assigns
       │     donations)         │     supported causes)
       │                        │
┌──────▼──────────────┐         │
│      Donation       │◀────────┘
│  (one-time/recurring│  (donation references
│   /round-up)        │   the selected cause)
└──────┬──────────────┘
       │
       │ N:1 (many donations, one organization)
       │
┌──────▼──────────────┐
│   Organization      │
│    (Charity)        │
└─────────────────────┘
```

**Additional Donation Relationships:**

```
┌─────────────┐         ┌──────────────┐
│   Client    │────────▶│  Donation    │
└─────────────┘         └──────┬───────┘
                               │
                               ├──────────────┬──────────────┐
                               │              │              │
                    ┌──────────▼──────┐  ┌───▼──────────────┐  ┌──────────────┐
                    │ PointsTransaction│  │ DonationReceipt  │  │    Cause     │
                    │   (earned)      │  │                  │  │  (Selected)  │
                    └─────────────────┘  └───────────────────┘  └──────────────┘
```

**Key Relationships:**

- `Client` → `Donation`: One-to-Many
- `Organization` → `Donation`: One-to-Many
- `Donation` → `PointsTransaction`: One-to-One (triggers point earning)
- `Donation` → `DonationReceipt`: One-to-One (optional)
- `Donation` → `Cause`: Many-to-One (selected cause at time of donation)
- `Organization` → `Cause`: Many-to-Many (assign supported causes)

---

## 3. Round-Up System Relationships

### 3.1 Round-Up Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1:N (one user can have multiple round-up setups)
       │
┌──────▼──────────────┐
│    BankConnection   │
│   (Plaid Item)      │
└──────┬──────────────┘
       │
       │ 1:N (one bank connection, multiple round-up configs)
       │
┌──────▼──────────────┐
│      RoundUp        │
│   (Settings)        │
└──────┬──────────────┘
       │
       │ 1:N (one round-up config, many transactions)
       │
┌──────▼──────────────────┐
│  RoundUpTransaction      │
│  (Individual entries)    │
└──────┬───────────────────┘
       │
       │ N:1 (many transactions → one donation when threshold met)
       │
┌──────▼──────────────┐
│      Donation       │
│   (round-up type)   │
└─────────────────────┘
```

**Complete Round-Up Relationship Chain:**

```
Client → BankConnection (Plaid) → RoundUp → RoundUpTransaction → Donation → Organization
  │           │             │              │                │
  │           │             │              │                │
  └──────────┴─────────────┴──┴──────────────┴────────────────┘
              (All linked to same user)
```

---

## 4. Rewards System Relationships

### 4.1 Reward Creation & Redemption Flow

```
┌─────────────┐
│  Business   │
└──────┬──────┘
       │
       │ 1:N (one business, many rewards)
       │
┌──────▼──────────────┐
│      Reward         │
│  (Offered by biz)   │
└──────┬──────────────┘
       │
       │ 1:N (one reward, many redemptions)
       │
┌──────▼──────────────────┐
│   RewardRedemption      │
│   (User claims reward)  │
└──────┬───────────────────┘
       │
       │ N:1 (many redemptions, one user)
       │
┌──────▼──────────────┐
│      Client         │
│     (Donor)         │
└─────────────────────┘
```

### 4.2 Points System Integration

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1:1 (one user, one points balance)
       │
┌──────▼──────────────┐
│      Points         │
│   (Balance)         │
└─────────────────────┘

┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1:N (one user, many point transactions)
       │
┌──────▼──────────────────┐
│  PointsTransaction      │
│  (Earned/Spent)         │
└──────┬───────────────────┘
       │
       ├──────────────────────┬──────────────────────┐
       │                      │                      │
       │ N:1                  │ N:1                  │
       │                      │                      │
┌──────▼──────┐      ┌────────▼────────┐   ┌────────▼────────┐
│  Donation   │      │ RewardRedemption│   │ Manual Adjust   │
│  (earned)   │      │ (spent)         │   │ (admin)         │
└─────────────┘      └─────────────────┘   └─────────────────┘
```

---

## 5. Badge System Relationships

### 5.1 Badge Progress Tracking

```
┌─────────────┐
│    Badge    │
│ (Template)  │
└──────┬──────┘
       │
       │ 1:N (one badge template, many user progress records)
       │
┌──────▼──────────────┐
│    UserBadge        │
│  (Progress Track)   │
└──────┬──────────────┘
       │
       │ N:1 (many progress records, one user)
       │
┌──────▼──────────────┐
│      Client         │
│     (Donor)         │
└─────────────────────┘
```

### 5.2 Badge Unlock Triggers

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1:N (donations trigger badge progress)
       │
┌──────▼──────────────┐
│      Donation       │
└──────┬──────────────┘
       │
       │ (triggers update)
       │
┌──────▼──────────────┐
│    UserBadge        │
│  (Progress Update)   │
└──────┬──────────────┘
       │
       │ N:1
       │
┌──────▼──────────────┐
│      Badge          │
│   (Template)        │
└─────────────────────┘
```

---

## 6. Scheduled Donations Relationships

### 6.1 Recurring Donation Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ 1:N (one user, many scheduled donations)
       │
┌──────▼──────────────────┐
│  ScheduledDonation       │
│  (Recurring Setup)       │
└──────┬───────────────────┘
       │
       │ N:1 (many scheduled, one organization)
       │
┌──────▼──────────────┐
│   Organization      │
└──────┬──────────────┘
       │
       │ (creates)
       │
┌──────▼──────────────┐
│      Donation       │
│  (recurring type)   │
└─────────────────────┘
```

---

## 7. Social/Follow Relationships

### 7.1 Following System

```
┌─────────────┐
│   Client    │
│  (Donor)    │
└──────┬──────┘
       │
       ├──────────────────────┬──────────────────────┐
       │                      │                      │
       │ N:M                  │ N:M                  │
       │                      │                      │
┌──────▼──────────┐  ┌────────▼──────────┐  ┌───────▼──────────┐
│BusinessFollower │  │OrganizationFollower│  │  (Many-to-Many) │
└──────┬──────────┘  └────────┬──────────┘  └─────────────────┘
       │                      │
       │ N:1                  │ N:1
       │                      │
┌──────▼──────────┐  ┌────────▼──────────┐
│    Business     │  │   Organization    │
└─────────────────┘  └───────────────────┘
```

---

## 8. Notification Relationships

### 8.1 Notification System

```
┌─────────────┐
│    Auth     │
│  (Receiver)  │
└──────┬──────┘
       │
       │ 1:N (one user, many notifications)
       │
┌──────▼──────────────┐
│   Notification      │
│                     │
└─────────────────────┘
```

**Notification Triggers:**

- Donation completed → Notification to Client
- Reward redeemed → Notification to Client
- Badge unlocked → Notification to Client
- Round-up threshold met → Notification to Client
- New reward available → Notification to BusinessFollowers

---

## 9. Complete Entity Relationship Diagram (ERD)

### 9.1 High-Level Overview

```
                    ┌─────────────┐
                    │    Auth     │
                    │  (Central)│
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐       ┌─────▼─────┐
   │ Client  │        │Business │       │Organization│
   └────┬────┘        └────┬────┘       └─────┬─────┘
        │                  │                  │
        │                  │                  │
   ┌────▼──────────────────▼──────────────────▼────┐
   │              Donation System                    │
   │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
   │  │Donation │  │ RoundUp  │  │ScheduledDon │  │
   │  └─────────┘  └──────────┘  └──────────────┘  │
   └───────────────────────────────────────────────┘
        │                  │                  │
   ┌────▼────┐
   │  Cause  │ (Catalog; orgs assign; donations reference)
   └─────────┘
   ┌────▼──────────────────▼──────────────────▼────┐
   │            Rewards & Points System             │
   │  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
   │  │ Reward   │  │  Points  │  │RewardRedemp │ │
   │  └──────────┘  └──────────┘  └──────────────┘ │
   └───────────────────────────────────────────────┘
        │                  │
   ┌────▼──────────────────▼────┐
   │      Gamification System   │
   │  ┌──────────┐  ┌──────────┐ │
   │  │  Badge   │  │UserBadge│ │
   │  └──────────┘  └──────────┘ │
   └─────────────────────────────┘
```

---

## 10. Relationship Summary Table

| Parent Model       | Child Model          | Relationship Type | Cardinality | Notes                     |
| ------------------ | -------------------- | ----------------- | ----------- | ------------------------- |
| Auth               | Client               | One-to-One        | 1:1         | Unique constraint         |
| Auth               | Business             | One-to-One        | 1:1         | Unique constraint         |
| Auth               | Organization         | One-to-One        | 1:1         | Unique constraint         |
| Client             | Donation             | One-to-Many       | 1:N         | Donor relationship        |
| Organization       | Donation             | One-to-Many       | 1:N         | Recipient relationship    |
| Client             | RoundUp              | One-to-Many       | 1:N         | Multiple round-up configs |
| BankConnection     | RoundUp              | One-to-Many       | 1:N         | One bank, multiple orgs   |
| RoundUp            | RoundUpTransaction   | One-to-Many       | 1:N         | Transaction tracking      |
| RoundUpTransaction | Donation             | Many-to-One       | N:1         | Aggregated into donation  |
| Client             | ScheduledDonation    | One-to-Many       | 1:N         | Recurring setup           |
| Organization       | ScheduledDonation    | One-to-Many       | 1:N         | Recipient                 |
| ScheduledDonation  | Donation             | One-to-Many       | 1:N         | Creates donations         |
| Business           | Reward               | One-to-Many       | 1:N         | Reward offerings          |
| Client             | RewardRedemption     | One-to-Many       | 1:N         | User redemptions          |
| Reward             | RewardRedemption     | One-to-Many       | 1:N         | Redemption instances      |
| Business           | RewardRedemption     | One-to-Many       | 1:N         | Validated by business     |
| Client             | Points               | One-to-One        | 1:1         | Balance tracking          |
| Client             | PointsTransaction    | One-to-Many       | 1:N         | Transaction history       |
| Donation           | PointsTransaction    | One-to-One        | 1:1         | Earns points              |
| RewardRedemption   | PointsTransaction    | One-to-One        | 1:1         | Spends points             |
| Badge              | UserBadge            | One-to-Many       | 1:N         | Progress tracking         |
| Client             | UserBadge            | One-to-Many       | 1:N         | User progress             |
| Donation           | UserBadge            | Many-to-One       | N:1         | Triggers progress         |
| Donation           | DonationReceipt      | One-to-One        | 1:1         | Receipt generation        |
| Donation           | Cause                | Many-to-One       | N:1         | Selected cause            |
| Organization       | Cause                | Many-to-Many      | N:M         | Supported causes          |
| Client             | BankConnection       | One-to-Many       | 1:N         | Multiple bank accounts    |
| Client             | BusinessFollower     | One-to-Many       | 1:N         | Following businesses      |
| Business           | BusinessFollower     | One-to-Many       | 1:N         | Followers                 |
| Client             | OrganizationFollower | One-to-Many       | 1:N         | Following orgs            |
| Organization       | OrganizationFollower | One-to-Many       | 1:N         | Followers                 |
| Auth               | Notification         | One-to-Many       | 1:N         | User notifications        |

---

## 11. Cascade Delete Considerations

### 11.1 Soft Delete Strategy (Recommended)

Most models should use soft deletes rather than cascade deletes:

- **Auth**: When deleted, mark `isDeleted: true`
- **Client/Business/Organization**: Soft delete through Auth
- **Donation**: Never delete, only mark as failed/refunded
- **RoundUpTransaction**: Never delete, historical record
- **PointsTransaction**: Never delete, audit trail
- **RewardRedemption**: Never delete, business record

### 11.2 Hard Delete Scenarios

Only safe to hard delete:

- **Notification**: Old notifications can be purged
- **BusinessFollower/OrganizationFollower**: Can be removed

---

## 12. Data Integrity Rules

### 12.1 Referential Integrity

1. **Donation** must have valid `donor` (Client), `organization`, and (if required by organization) `cause`
2. **RoundUp** must have valid `user`, `organization`, and `bankConnection`
3. **RewardRedemption** must have valid `user`, `reward`, and `business`
4. **UserBadge** must have valid `user` and `badge`
5. **PointsTransaction** must have valid `user`

### 12.2 Business Rules

1. **Points Balance**: Must always equal sum of earned - spent
2. **RoundUp Accumulation**: Must match sum of unprocessed RoundUpTransactions
3. **Reward Redemption**: Must check available points before allowing
4. **Badge Progress**: Must recalculate on each donation
5. **Donation Receipt**: Can only be generated for completed donations

---

## 13. Query Patterns

### 13.1 Common Queries

**Get user's donation history:**

```
Client → Donation (populate organization)
```

**Get user's points balance:**

```
Client → Points (direct lookup)
```

**Get user's badge progress:**

```
Client → UserBadge → Badge (populate badge details)
```

**Get business rewards:**

```
Business → Reward (filter by status: active)
```

**Get round-up transactions:**

```
Client → RoundUp → RoundUpTransaction (filter by processed: false)
```

**Get scheduled donations:**

```
Client → ScheduledDonation (filter by isActive: true, populate organization)
```

---

## 14. Index Strategy

### 14.1 Foreign Key Indexes

All foreign key fields should be indexed for join performance:

- `donor` in Donation
- `organization` in Donation
- `user` in all user-related models
- `business` in Reward and RewardRedemption
- `badge` in UserBadge

### 14.2 Composite Indexes

- `(user, badge)` in UserBadge (unique)
- `(user, business)` in BusinessFollower (unique)
- `(user, organization)` in OrganizationFollower (unique)
- `(donor, donationDate)` in Donation (for user history)
- `(roundUp, processed)` in RoundUpTransaction (for aggregation)

---

## 15. Visual Relationship Map (Simplified)

```
                    AUTH
                     │
        ┌────────────┼────────────┐
        │            │            │
     CLIENT      BUSINESS    ORGANIZATION
        │            │            │
        │            │            │
    ┌───┴────────────┴────────────┴───┐
    │                                  │
 DONATION ──► CAUSE ───────────────────┘
    │
    ├───► POINTS TRANSACTION
    ├───► DONATION RECEIPT
    └───► USER BADGE (progress)

CLIENT ──► ROUND UP (PLAID) ──► ROUND UP TRANSACTION ──► DONATION
    │
    ├───► SCHEDULED DONATION ──► DONATION
    ├───► REWARD REDEMPTION ──► POINTS TRANSACTION
    ├───► BUSINESS FOLLOWER
    └───► ORGANIZATION FOLLOWER

BUSINESS ──► REWARD ──► REWARD REDEMPTION

BADGE ──► USER BADGE ──► CLIENT
```

---

_Last Updated: [Current Date]_
_Document Version: 1.0_
