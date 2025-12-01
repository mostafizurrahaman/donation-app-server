// =============================================
// PAYOUT & BALANCE SYSTEM - SIMPLIFIED
// =============================================
// Relationships:
// - Organization (1) ←→ (1) OrganizationBalance
// - Organization (1) ←→ (N) BalanceTransaction
// - Organization (1) ←→ (N) Payout
// - Donation (1) ←→ (N) BalanceTransaction
// - Payout (1) ←→ (N) BalanceTransaction
// =============================================

// =============================================
// EXISTING MODELS (Referenced)
// =============================================

Table Auth {
\_id ObjectId [pk]
email varchar [unique, not null]
role varchar [note: 'client, organization, business, admin']
createdAt timestamp
updatedAt timestamp

Note: 'Existing model - for requestedBy/approvedBy references'
}

Table Organization {
\_id ObjectId [pk]
auth ObjectId [not null]
name varchar

// Existing fields...
tfnOrAbnNumber varchar
zakatLicenseHolderNumber varchar

// ========================================
// PAYOUT SETTINGS (Moved here from PayoutSettings)
// ========================================
stripeConnectAccountId varchar [note: 'For receiving payouts']
stripeConnectOnboarded boolean [default: false]

// Tax Configuration
taxExempt boolean [default: false, note: 'If org is tax exempt']
taxExemptCertificate varchar [note: 'Certificate number/URL if exempt']

// Fee Configuration (optional override)
customPlatformFeeRate decimal [note: 'Negotiated rate override, null = use default']

// Payout Preferences
minimumPayoutAmount decimal [default: 50, note: 'Min amount for payout request']
payoutNotificationEmail varchar [note: 'Email for payout notifications']

createdAt timestamp
updatedAt timestamp

indexes {
stripeConnectAccountId
}

Note: 'Existing model - payout settings added here'
}

Table Donation {
\_id ObjectId [pk]
donor ObjectId [not null]
organization ObjectId [not null]
cause ObjectId
donationType varchar [not null, note: 'one-time, recurring, round-up']
amount decimal [not null]
isTaxable boolean [default: false]
taxAmount decimal [default: 0]
totalAmount decimal [not null]
currency varchar [default: 'USD']
status varchar [default: 'pending']
stripePaymentIntentId varchar
donationDate timestamp
createdAt timestamp
updatedAt timestamp

Note: 'Existing model - individual donation records'
}

// =============================================
// NEW MODEL: OrganizationBalance
// =============================================

Table OrganizationBalance {
\_id ObjectId [pk]
organization ObjectId [unique, not null]

// Lifetime Totals (Reporting)
lifetimeEarnings decimal [default: 0, note: 'Total donations received ever']
lifetimePaidOut decimal [default: 0, note: 'Total net payouts ever']
lifetimePlatformFees decimal [default: 0, note: 'Total platform fees paid ever']
lifetimeTaxDeducted decimal [default: 0, note: 'Total tax deducted ever']
lifetimeRefunds decimal [default: 0, note: 'Total refunds issued ever']

// Current Balances
pendingBalance decimal [default: 0, note: 'In clearing period']
availableBalance decimal [default: 0, note: 'Ready to withdraw']
reservedBalance decimal [default: 0, note: 'Locked for payouts']

// Pending Breakdown by Donation Type (for filtering)
pendingByType_oneTime decimal [default: 0]
pendingByType_recurring decimal [default: 0]
pendingByType_roundUp decimal [default: 0]

// Available Breakdown by Donation Type (for filtering)
availableByType_oneTime decimal [default: 0]
availableByType_recurring decimal [default: 0]
availableByType_roundUp decimal [default: 0]

// Configuration
clearingPeriodDays int [default: 7, note: 'Days before pending → available']

// Tracking
lastTransactionAt timestamp
lastPayoutAt timestamp
lastReconciliationAt timestamp

createdAt timestamp
updatedAt timestamp

indexes {
organization [unique]
availableBalance
pendingBalance
lastTransactionAt
}

Note: '''
1:1 with Organization
Real-time balance tracking
'''
}

// =============================================
// NEW MODEL: BalanceTransaction (LEDGER)
// =============================================

Table BalanceTransaction {
\_id ObjectId [pk]
organization ObjectId [not null]

// Transaction Details
type varchar [not null, note: 'credit, debit']
category varchar [not null, note: 'donation_received, donation_cleared, payout_reserved, payout_completed, platform_fee, tax_deducted, refund_issued, payout_cancelled, payout_failed, adjustment_credit, adjustment_debit']
amount decimal [not null, note: 'Always positive']

// Balance Snapshot After Transaction
balanceAfter_pending decimal [not null]
balanceAfter_available decimal [not null]
balanceAfter_reserved decimal [not null]
balanceAfter_total decimal [not null]

// Source References
donation ObjectId [note: 'For donation-related transactions']
payout ObjectId [note: 'For payout-related transactions']

// For Filtering
donationType varchar [note: 'one-time, recurring, round-up']

// Details
description varchar [not null]
metadata json [note: 'Additional context']

// Admin Tracking
processedBy ObjectId [note: 'For manual adjustments']

// Idempotency
idempotencyKey varchar [unique]

createdAt timestamp

indexes {
organization
(organization, createdAt)
(organization, donationType, createdAt)
(organization, category, createdAt)
donation
payout
idempotencyKey [unique]
}

Note: '''
MIDDLE MODEL - Audit Trail
Every balance change recorded here
'''
}

// =============================================
// NEW MODEL: Payout
// =============================================

Table Payout {
\_id ObjectId [pk]
organization ObjectId [not null]

// Reference
payoutNumber varchar [unique, not null, note: 'e.g., PO-2401-00001']

// Amount Breakdown
requestedAmount decimal [not null, note: 'Gross amount requested']
platformFeeRate decimal [not null, note: 'Rate used (from org or default)']
platformFeeAmount decimal [not null, note: 'Calculated fee']
taxRate decimal [not null, note: 'Tax rate (0 if exempt)']
taxAmount decimal [not null, note: 'Calculated tax']
netAmount decimal [not null, note: 'What org receives']

currency varchar [default: 'USD']

// Scheduling
scheduledDate timestamp [not null, note: 'When org wants payout']

// Status
status varchar [not null, default: 'pending', note: 'pending, approved, processing, completed, failed, cancelled']

// Processing
payoutMethod varchar [not null, default: 'stripe_connect', note: 'stripe_connect, bank_transfer']
processedAt timestamp
completedAt timestamp

// Stripe
stripeTransferId varchar
stripePayoutId varchar

// Bank Details (if not using Stripe Connect)
bankDetails_bankName varchar
bankDetails_accountNumberLast4 varchar
bankDetails_bsb varchar

// Workflow
requestedBy ObjectId [not null, note: 'Org user who requested']
approvedBy ObjectId [note: 'Admin who approved']
approvedAt timestamp

// Failure
failureReason text
failureCode varchar
retryCount int [default: 0]
maxRetries int [default: 3]

// Notes
notes text
adminNotes text

// Breakdown (for reporting)
donationBreakdown_oneTime decimal [default: 0]
donationBreakdown_recurring decimal [default: 0]
donationBreakdown_roundUp decimal [default: 0]

createdAt timestamp
updatedAt timestamp

indexes {
organization
(organization, status)
(organization, createdAt)
(status, scheduledDate)
payoutNumber [unique]
stripeTransferId
requestedBy
approvedBy
}

Note: '''
Payout lifecycle tracking
Fee rates stored per-payout (snapshot at time of request)
'''
}

// =============================================
// RELATIONSHIPS
// =============================================

Ref: OrganizationBalance.organization - Organization.\_id [delete: Cascade]
Ref: BalanceTransaction.organization > Organization.\_id
Ref: BalanceTransaction.donation > Donation.\_id
Ref: BalanceTransaction.payout > Payout.\_id
Ref: BalanceTransaction.processedBy > Auth.\_id
Ref: Payout.organization > Organization.\_id
Ref: Payout.requestedBy > Auth.\_id
Ref: Payout.approvedBy > Auth.\_id
