Your goal is to create a commit message for all changes in this repository since the last commit.

Do the following:
1. Run `git diff HEAD --stat` to see which files changed
2. Run `git diff HEAD` to see the exact line-level changes
3. Write a concise commit message: one summary line (under 72 chars), followed by a blank line and a short bullet list of the key changes

<example>
Add role-based staff accounts, event log, and author attribution

- Replace `is_primary`/`name` on AdminAccount with a 4-tier role system (contributor, editor, administrator, owner) and add full_name, location, avatar_filename fields
- Add SiteEventLog model and admin_history blueprint for tracking added/edited/deleted actions across posts, comments, users, and settings
- Overhaul AdminAccountsPage: tabbed layout, StaffProfileModal with avatar upload, role assignment, password change, and ownership transfer
- Add role_at_least / role_required decorators for backend authorization
- Allow admin sessions to post comments attributed to their account
- Show owner avatar + name as post author on BlogPostPage
- Display author in blog editor sidebar and "View History" card on settings page
</example>

For simple changes, a single summary line is enough — skip the bullet list if the change is self-explanatory.