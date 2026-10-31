# Agent guidance

## Local deployment

These notes describe this development environment. Keep machine-specific
deployment instructions out of public README files.

Deployment helpers operate on real services and may commit, push, restart Odoo,
or install/upgrade modules. Run them only when the user explicitly requests
the corresponding action; never use them for validation.

- `./restart_odoo20.sh` deploys the current repository and restarts Odoo.
- `./upush.sh "commit message"` commits and pushes, with an optional restart.
- `./fulldeploy.sh "commit message"` commits, pushes, deploys, and installs or
  upgrades `o3p_widgets` on the configured database.

Deployment settings can be overridden with the environment variables declared
at the top of each script.
