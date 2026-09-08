<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Completion workflow

After completing each user task, commit and push the finished changes to
`origin/main` as part of completion. Review the diff, run appropriate checks, and
exclude credentials, local environments and generated files. Fetch and preserve
remote changes; never force-push to replace them. Report the final commit hash and
push result. If work is experimental/incomplete and should not be pushed, explain
that explicitly. If authentication or another external blocker prevents pushing,
report it clearly rather than treating a local commit as completion.
