# Native owner repository administration

Mahoraga routes bounded repository operations from an authenticated owner session through the installed GitHub App.

Supported owner commands include repository status, exact-head pull request checks, bounded Verify workflow dispatch, draft pull request creation, and protected squash merge.

Every write is bound to an exact source SHA. GitHub branch protection and required Ubuntu and Windows verification remain authoritative. Results and typed failures are persisted so reconnecting clients can recover the same receipt without repeating an external action.
