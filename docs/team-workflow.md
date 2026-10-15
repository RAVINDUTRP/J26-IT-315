# Team workflow
1. One GitHub repo, 4 collaborators. Protect `main`.
2. Branch per feature: `comp3/feature-engineering`.
3. Merge into `main` by PR; at least one other member reviews anything touching `shared/`, `backend/`, `frontend/`.
4. Keep the Claim -> Evidence -> Decision log (proposal appendix) updated after each experiment.

## CI ownership and merge safety

- Treat `.github/workflows/ci.yml` as integration-owned. Do not copy or modify it
  in feature branches unless the change is specifically a CI change.
- Before opening or updating a PR, sync with `main` and resolve conflicts locally:
  `git fetch origin` followed by `git rebase origin/main`.
- Keep each PR focused on one component. If two members need the same file, agree
  on the change first and merge the smaller PR before rebasing the other branch.
- The workflow runs on pushes and pull requests targeting `main`. A CI failure
  blocks confidence in the merge, but CI itself does not merge branches or
  create conflicts.
