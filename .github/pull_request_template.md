## What & why



## Release safety (canary)

Production releases go to a share of visitors first, so for a while two builds run side
by side — and two people in one room can be on different builds
(`docs/plans/PLAN-canary.md` §6).

- [ ] No socket event or payload renamed/removed — or this is step 1 of 2 (sends and accepts both)
- [ ] No IndexedDB `DB_VERSION` bump, no localStorage key/format rename
- [ ] If either box can't be ticked: the PR title contains `[skip canary]`
