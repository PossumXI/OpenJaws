export const PR_TITLE = 'Add OpenJaws GitHub Workflow'

export const GITHUB_ACTION_SETUP_DOCS_URL =
  'https://code.openjaws.com/docs/en/cli-reference'

export const WORKFLOW_CONTENT = `name: OpenJaws

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  openjaws:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@openjaws')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@openjaws')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@openjaws')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@openjaws') || contains(github.event.issue.title, '@openjaws')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read # Required for OpenJaws to read CI results on PRs
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run OpenJaws
        id: openjaws
        uses: PossumXI/openjaws-action@v1
        with:
          openjaws_api_key: \${{ secrets.OPENJAWS_API_KEY }}

          # This is an optional setting that allows OpenJaws to read CI results on PRs
          additional_permissions: |
            actions: read

          # Optional: Give a custom prompt to OpenJaws. If this is not specified, OpenJaws will perform the instructions specified in the comment that tagged it.
          # prompt: 'Update the pull request description to include a summary of changes.'

          # Optional: Add CLI args to customize behavior and configuration
          # or https://code.openjaws.com/docs/en/cli-reference for available options
          # openjaws_args: '--allowed-tools Bash(gh pr:*)'

`

export const PR_BODY = `## 🤖 Installing OpenJaws GitHub App

This PR adds a GitHub Actions workflow that enables OpenJaws integration in our repository.

### What is OpenJaws?

[OpenJaws](https://openjaws.dev) is an AI coding agent that can help with:
- Bug fixes and improvements  
- Documentation updates
- Implementing new features
- Code reviews and suggestions
- Writing tests
- And more!

### How it works

Once this PR is merged, we'll be able to interact with OpenJaws by mentioning @openjaws in a pull request or issue comment.
Once the workflow is triggered, OpenJaws will analyze the comment and surrounding context, and execute on the request in a GitHub Action run.

### Important Notes

- **This workflow won't take effect until this PR is merged**
- **@openjaws mentions won't work until after the merge is complete**
- The workflow runs automatically whenever OpenJaws is mentioned in PR or issue comments
- OpenJaws gets access to the entire PR or issue context including files, diffs, and previous comments

### Security

- Our OpenJaws API key is securely stored as a GitHub Actions secret
- Only users with write access to the repository can trigger the workflow
- All OpenJaws runs are stored in the GitHub Actions run history
- OpenJaws's default tools are limited to reading and writing files plus repository-safe GitHub operations such as comments, branches, and commits.
- We can add more allowed tools by adding them to the workflow file like:

\`\`\`
allowed_tools: Bash(npm install),Bash(npm run build),Bash(npm run lint),Bash(npm run test)
\`\`\`

There's more information in the OpenJaws CLI and workflow documentation.

After merging this PR, let's try mentioning @openjaws in a comment on any PR to get started!`

export const CODE_REVIEW_PLUGIN_WORKFLOW_CONTENT = `name: OpenJaws Review

on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
    # Optional: Only run on specific file changes
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"

jobs:
  openjaws-review:
    # Optional: Filter by PR author
    # if: |
    #   github.event.pull_request.user.login == 'external-contributor' ||
    #   github.event.pull_request.user.login == 'new-developer' ||
    #   github.event.pull_request.author_association == 'FIRST_TIME_CONTRIBUTOR'

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run OpenJaws Review
        id: openjaws-review
        uses: PossumXI/openjaws-action@v1
        with:
          openjaws_api_key: \${{ secrets.OPENJAWS_API_KEY }}
          plugin_marketplaces: 'https://github.com/PossumXI/OpenJaws.git'
          plugins: 'code-review@openjaws-plugins'
          prompt: '/code-review:code-review \${{ github.repository }}/pull/\${{ github.event.pull_request.number }}'
          # or https://code.openjaws.com/docs/en/cli-reference for available options

`
