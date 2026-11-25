#!/usr/bin/env node
// scripts/generate-cicd-deploy-guide.mjs
//
// Builds CI-CD-Deploy-Guide.pdf from the incident write-up and the canonical
// auto-deploy procedure.
//
// Rendering is two-pass: pass 1 lays the document out to learn which page each
// top-level section lands on, pass 2 re-renders with a table of contents
// carrying real page numbers. Because the TOC occupies a known amount of space
// (inserted before the body in both passes) the page count is identical between
// passes.
//
// Usage:  node scripts/generate-cicd-deploy-guide.mjs [outputPath]

import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { Book, CONTENT_W, C } from "./lib/pdf-kit.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const OUT = process.argv[2] || join(ROOT, "CI-CD-Deploy-Guide.pdf")
const MIN_PAGES = 40

const TITLE = "Asset Tracking - CI/CD and Auto-Deploy Guide"
const SECTIONS = [
  "1. Preface: scope and conventions",
  "2. Incident report: a deploy that refuses to run",
  "3. Root cause analysis",
  "4. Mental model: the pipeline end to end",
  "5. Core concepts for the on-call engineer",
  "6. The canonical auto-deploy procedure",
  "7. Stage 1: repository and workflow setup",
  "8. Stage 2: container registry setup",
  "9. Stage 3: secrets and variables",
  "10. Stage 4: the self-hosted runner",
  "11. Stage 5: container engine and WSL2",
  "12. Stage 6: first successful deploy",
  "13. Failure mode catalog",
  "14. Diagnostic methods",
  "15. Triage decision trees",
  "16. Production health verification",
  "17. Pipeline hardening",
  "18. Day-2 operations",
  "19. Incident response procedures",
  "20. Quick reference and glossary",
]

// Pass 1 and pass 2 share this renderer; only the TOC differs.
function render(book, tocEntries) {
  book.cover({
    kicker: "Reading material for the DevOps team",
    title: "CI/CD and Auto-Deploy Guide",
    subtitle:
      "How the asset-tracking pipeline works, why a deploy got stuck for hours, and " +
      "the exact procedure to make push-to-production work on any host.",
    meta: [
      ["Application", "Asset Tracking - Next.js 16, PostgreSQL 16, Redis 7, Nginx"],
      ["Pipeline", "GitHub Actions - CI on push, Deploy on successful CI"],
      ["Registry", "GitHub Container Registry (ghcr.io), private packages"],
      ["Runner", "Self-hosted Linux x64 runner, label 'wsl', systemd service"],
      ["Host", "WSL2 on Windows with Docker Desktop as the container engine"],
      ["Repository", "github.com/EbissaMideksa/asset-tracking"],
      ["Companion", "DevOps-Reading-Guide.pdf - the operational runbook"],
      ["Audience", "DevOps engineers, SREs, and platform operators"],
    ],
  })

  if (tocEntries) book.toc(tocEntries)
  else book.toc(SECTIONS.map((s) => [s, null]))

  // ---- 1. Preface --------------------------------------------------------
  book.h1(SECTIONS[0])
  book.text(
    "This guide answers two questions. First, what actually happened when a deployment " +
      "sat in the GitHub Actions queue for hours while the pipeline looked configured and " +
      "correct. Second, what a DevOps engineer should do, in order, so that the next " +
      "deployment succeeds without any of that improvisation. Both questions are answered " +
      "from a real session, not from a hypothetical."
  )
  book.h2("Who this is for")
  book.text(
    "You are the person paged when a deploy is red, when production is down, or when a " +
      "release is expected and nothing appears. You may be new to GitHub Actions, new to " +
      "containers, or new to this specific repository. This document assumes you can use a " +
      "shell and read a diff, and explains everything else."
  )
  book.h2("How to read this document")
  book.table(
    ["If you are...", "Start at", "Why"],
    [
      [
        "Responding to a stuck deploy right now",
        "Section 15, then 13",
        "The triage tree routes you to the failure mode in minutes",
      ],
      [
        "Setting up auto-deploy on a new host",
        "Section 6, then 7 to 12",
        "The master checklist, then one chapter per stage",
      ],
      [
        "Reviewing this incident for a post-mortem",
        "Sections 2 and 3",
        "The narrative and the root causes with evidence",
      ],
      ["New to the platform", "Sections 4 and 5", "The mental model before the procedure"],
      ["Looking something up under pressure", "Sections 13 and 20", "Catalog and quick reference"],
    ],
    { widths: [40, 28, CONTENT_W - 68] }
  )
  book.h2("Conventions used in this document")
  book.table(
["Notation", "Meaning"],
    [
      ["$ command", "A command to type, with the shell prompt omitted"],
      ["**bold**", "A setting, label, or identifier that must match exactly"],
      ["info callout", "Background knowledge; safe to skip under pressure"],
      ["warn callout", "A trap that has already cost time on this project"],
      ["danger callout", "Data loss, security exposure, or a production outage"],
      ["ok callout", "A confirmed working state or a verified procedure"],
    ],
    { widths: [34, CONTENT_W - 34] }
  )
  book.callout(
    "All output in this document is plain ASCII",
    "The PDF renderer folds any non-ASCII character to a question mark, so this guide " +
      "deliberately avoids smart quotes, em dashes, and arrow glyphs. If you see a stray " +
      "question mark in a command, it came from a copy-paste rather than from the source.",
    "info"
  )
  book.h2("The single most important lesson")
  book.callout(
    "A queued job is not a running job",
    "The single most expensive misunderstanding in this session was reading a job stuck in " +
      "'Queued' as though it were running slowly. A queued job has not started. It is " +
      "waiting for a machine to run it, and no amount of waiting will produce one. Before " +
      "any other diagnosis, always confirm that something is available to execute the job.",
    "danger"
  )

  // ---- 2. Incident report ------------------------------------------------
  book.h1(SECTIONS[1])
  book.text(
    "This section is the narrative. It is written as it happened, because the order of " +
      "events is what makes the incident instructive. Each step below records what was " +
      "observed, what was concluded, and what turned out to be true."
  )
  book.h2("The opening symptom")
  book.text(
    "A deployment run had been sitting in the GitHub Actions tab for approximately " +
      "46 minutes. Its status was 'Queued'. Its duration was shown as a dash rather than a " +
      "number, and it had produced no artifacts. The triggering CI run had completed " +
      "successfully. The commit was b7250cb on main."
  )
  book.callout(
    "The duration field is the tell",
    "A dash in the duration column means the job has not started. A running or finished " +
      "job always has a duration. Reading the dash as 'slow' rather than 'not started' is " +
      "what sends people looking for a performance problem that does not exist.",
    "info"
  )
  book.h2("First hypothesis: capacity or billing")
  book.text(
    "A queued job on GitHub-hosted runners often means the account has exhausted its " +
      "included minutes, or that a concurrent-job limit is saturated. Neither applied here: " +
      "the CI workflow had already completed, so hosted runners were demonstrably available " +
      "and funded."
  )
  book.h2("The observation that redirected everything")
  book.text(
    "Reading the workflow file revealed that the deploy job targeted a self-hosted runner: " +
      "it requested the labels self-hosted, linux, x64, and wsl. That single line reframed " +
      "the entire problem. The job was not waiting for capacity. It was waiting for a " +
      "specific machine that, at that moment, did not exist in any usable form."
  )
  book.code(
    "runs-on: >-\n  ${{ fromJSON(vars.DEPLOY_RUNNER_LABELS\n               || '[\"self-hosted\",\"linux\",\"x64\",\"wsl\"]') }}",
    { caption: "deploy.yml - the job asks for a machine that must already exist" }
  )
  book.h2("Evidence gathered from the host")
  book.text(
    "The runner package had been downloaded and extracted into the repository working " +
      "directory, which strongly suggested that setup had been attempted at some point. The " +
      "following checks established what had actually been done."
  )
  book.table(
    ["Check", "Result", "Meaning"],
    [
      [".runner / .credentials present", "No", "The runner was never registered with GitHub"],
      ["Runner.Listener process", "Not running", "No runner was listening for jobs"],
      ["_work/ and _diag/ directories", "Absent", "The runner had never executed a job"],
      ["gh command line client", "Not installed", "No API access from the host"],
      ["docker CLI", "/usr/bin/docker", "Installed"],
      ["/etc/wsl.conf", "systemd=true", "systemd available for service management"],
    ],
    { widths: [46, 30, CONTENT_W - 76] }
  )
  book.callout(
    "Extracted is not configured",
    "Finding a runner tarball unpacked in a directory looks like progress, and it is " +
      "tempting to treat it as 'runner installed'. Registration is what creates the " +
      ".runner and .credentials files, and only a registered runner ever phones home. The " +
      "distinction between downloaded, configured, registered, and running is covered in " +
      "detail in section 10.",
    "warn"
  )

  book.h2("Why the wait was silent rather than loud")
  book.text(
    "Two design choices in the workflow combined to turn a hard stop into an indefinite " +
      "silent wait. The job sets a 20 minute timeout, but that timeout only begins counting " +
      "once a runner picks the job up. A job waiting for a runner is exempt from it. " +
      "Separately, a concurrency group with cancel-in-progress set to false means the stuck " +
      "job becomes a head-of-line blocker, and every subsequent deploy queues behind it."
  )
  book.callout(
    "Timeout-minutes does not protect a queued job",
    "This is counter-intuitive and worth memorising. A job that has never started is not " +
      "subject to its own timeout, because no compute time has been consumed. If you rely on " +
      "timeout-minutes to catch a stalled pipeline, you will never be alerted to a missing " +
      "runner. You need a separate mechanism for that; section 17 proposes one.",
    "warn"
  )
  book.h2("Resolution of the first fault")
  book.text(
    "A runner registration token was generated, and the runner was configured and registered " +
      "with the label wsl. The runner then began listening for jobs and immediately claimed " +
      "the deployment that had been queued for 46 minutes. This confirmed, as a side effect, " +
      "that the label configuration was correct, because a label mismatch would have left the " +
      "job queued indefinitely."
  )
  book.code(
    "Connected to GitHub\nCurrent runner version: '2.337.0'\nListening for Jobs\nRunning job: Pull artifact and deploy\nJob completed with result: Failed",
    { caption: "the moment the queued job finally had a machine to run on" }
  )

  book.h1(SECTIONS[2])
  book.text(
    "With the runner online, the job executed for the first time and failed immediately. " +
      "That produced a second, different fault. This section records the chain of failures, " +
      "each one masked by the previous, and the evidence that identified each in turn."
  )
  book.h2("Fault 2: configuration stored in the wrong place")
  book.text(
    "The first failing step was the preflight check, which died in roughly twenty " +
      "milliseconds. Inspection of the workflow showed the preflight's first substantive test " +
      "was whether the STACK_DIR repository variable was non-empty. The value had been " +
      "configured correctly in content, but stored as a Secret rather than as a Variable."
  )
  book.code(
    "env:\n  STACK_DIR: ${{ vars.STACK_DIR }}     # resolves to EMPTY if stored as a secret",
    { caption: "deploy.yml - the distinction that cost an hour" }
  )
  book.callout(
    "vars and secrets are different stores",
    "A value placed in Secrets is invisible to a vars reference, and a value placed in " +
      "Variables is invisible to a secrets reference. Both misconfigurations fail silently: " +
      "the expression expands to an empty string rather than raising an error. The two UI " +
      "pages differ only by the word secrets versus variables in the URL, which is exactly " +
      "why this is such a common and durable mistake.",
    "danger"
  )
  book.h2("A discarded hypothesis, and why it mattered")
  book.text(
    "An initial theory was that the twenty millisecond failure proved the variable was " +
      "unset, because the check appeared to be the first thing to run. That reasoning was " +
      "tested directly by executing the preflight script locally under both conditions and " +
      "timing each. Both branches completed in approximately the same duration, which " +
      "disproved the timing argument entirely."
  )
  book.callout(
    "Timing evidence is weak evidence",
    "A fast failure narrows the field but does not identify the cause. Here the conclusion " +
      "had to rest on elimination instead: docker was verified present, the environment file " +
      "was verified present, and the TLS directory was verified present, which left the " +
      "variable itself as the only remaining explanation. Always confirm by elimination and " +
      "say so, rather than presenting an inference as an observation.",
    "info"
  )
  book.h2("Fault 3: a genuine outage discovered through the pipeline")
  book.text(
    "With the variable corrected, preflight passed and the pipeline advanced to pulling the " +
      "container image, which failed in about one second. The cause was not registry " +
      "credentials. The container engine on the host was not running. Checking further " +
      "revealed that nothing was listening on ports 80 or 443 and that the application " +
      "health endpoint did not respond: production was down."
  )
  book.code(
    "system boot 2026-10-05 12:43\nrunner process: not running\n/var/run/docker.sock: No such file or directory\ncurl https://localhost/api/health: no response",
    { caption: "the state of the host after an unplanned restart" }
  )
  book.callout(
    "The pipeline correctly reported a real outage",
    "It is worth recording that the red build was accurate. The deployment genuinely could " +
      "not proceed because the machine that performs deployments was not operational. The " +
      "failure was that the pipeline could not explain this: it reported a registry error " +
      "rather than an unavailable engine. That gap is closed in section 17.",
    "ok"
  )
book.h2("Fault 4: the reverse proxy silently refused to start")
  book.text(
    "With the engine restored, eight of nine containers came up healthy and Docker " +
      "automatically relaunched them. The reverse proxy did not. It was found in state " +
      "'Exited (127)'. Exit status 127 means a command was not found, and the cause was a " +
      "startup script mounted into the container's entrypoint directory that had lost its " +
      "executable bit."
  )
  book.code(
    "volumes:\n  - ./scripts/nginx-upstream.sh:/docker-entrypoint.d/00-upstream.sh:ro",
    { caption: "the nginx entrypoint executes this file at boot" }
  )
  book.text(
    "The nginx image runs every script in /docker-entrypoint.d at startup. If a mounted " +
      "script is not executable, the entrypoint attempts to execute it, fails with 127, and " +
      "the container exits before nginx ever starts. Because the file is bind-mounted from " +
      "the host, the fix is on the host filesystem, not inside the image."
  )
  book.callout(
    "This failure was invisible to every dashboard",
    "Eight healthy containers is not 'the stack is up'. The only service publishing ports " +
      "80 and 443 was the one that had failed, so the application was unreachable while " +
      "every container-level health indicator reported success. This is the argument for " +
      "always validating from outside the container network, which section 16 formalises.",
    "danger"
  )
  book.h2("Fault 5: valid credentials, insufficient scope")
  book.text(
    "The final fault was the subtlest. Authenticating to the container registry succeeded " +
      "and reported success, yet pulling an image was denied. The reason is that the " +
      "authentication endpoint only validates that credentials are well formed; it does not " +
      "verify that the token can read any particular package. The token was valid but lacked " +
      "the package read permission."
  )
  book.callout(
    "Login success does not mean pull success",
    "Treat 'logged in successfully' and 'can pull the release image' as two separate tests. " +
      "Always verify with an actual pull of the exact tag the deploy will request, using the " +
      "exact repository name. A typo in the owner name produces a denial that looks exactly " +
      "like a permissions problem.",
    "warn"
  )
  book.h2("Consolidated summary")
  book.table(
    ["#", "Fault", "Visible as", "Real cause", "Class"],
    [
      [
        "1",
        "Deploy queued indefinitely",
        "Status Queued, duration dash",
        "No runner registered",
        "Missing dependency",
      ],
      [
        "2",
        "Preflight failed in 20 ms",
        "Deploy red at step 4",
        "Value stored as a Secret, read as a Variable",
        "Misconfiguration",
      ],
      [
        "3",
        "Image pull failed in 1 s",
        "Deploy red at step 6",
        "Container engine down; production outage",
        "Host failure",
      ],
      [
        "4",
        "No traffic on 80/443",
        "App unreachable, containers healthy",
        "Startup script not executable, proxy exit 127",
        "File mode",
      ],
      [
        "5",
        "Registry denied",
        "Pull denied after successful login",
        "Token lacked package read permission",
        "Least privilege",
      ],
    ],
    { widths: [8, 34, 34, 46, 30], fontSize: 7.4, headSize: 7.8 }
  )
  book.callout(
    "Four of the five faults were invisible without direct inspection",
    "None of these would have been self-evident from the GitHub Actions user interface. Each " +
      "required either reading a workflow file, reading a runner log on the host, or checking " +
      "the host directly. That is the central argument for section 14.",
    "info"
  )
book.h1(SECTIONS[3])
  book.text(
    "Before any procedure, you need the model. Almost every avoidable mistake in this kind " +
      "of setup comes from holding a wrong mental picture: assuming the deploy runs in the " +
      "cloud, or assuming the host builds the release, or assuming a workflow file is active " +
      "the moment it is committed."
  )
  book.h2("The two workflows")
  book.text(
    "This repository has two independent workflows. They are not stages of one pipeline in " +
      "the sense of being one job list; they are two separate workflows with separate triggers."
  )
  book.table(
    ["Workflow", "Trigger", "Where it runs", "Produces"],
    [
      [
        "CI",
        "Every push to main, and every pull request",
        "GitHub-hosted runners (ubuntu-latest)",
        "A verified build, plus images pushed to the registry on main only",
      ],
      [
        "Deploy",
        "Completion of CI, or a manual dispatch",
        "A self-hosted runner on the production host",
        "A new live release on the blue/green pair",
      ],
    ],
    { widths: [18, 40, 44, CONTENT_W - 102] }
  )
  book.callout(
    "Deploy never builds anything",
    "The production host is not a build machine. CI compiles and publishes; the host only " +
      "pulls and rolls out. This separation is deliberate: it means the artifact that runs in " +
      "production is the exact artifact that passed CI, and the host's local toolchain can " +
      "never influence what is deployed.",
    "info"
  )
  book.h2("Why deploy waits for CI instead of triggering on the push")
  book.text(
    "The deploy workflow is triggered by the completion of CI rather than by the push itself. " +
      "A push-triggered deployment would race the build: the deploy job could begin pulling an " +
      "image that has not been published yet. Because the trigger is workflow_run with the " +
      "completed type, the deploy always starts after CI has finished, and it additionally " +
      "checks the conclusion so that a failed build is never deployed."
  )
  book.code(
    "on:\n  workflow_run:\n    workflows: [\"CI\"]\n    branches: [main, master]\n    types: [completed]\n  workflow_dispatch:\n    inputs:\n      sha:\n        description: \"Short SHA to deploy\"",
    { caption: "deploy.yml - trigger configuration" }
  )
  book.callout(
    "workflow_run runs the default branch version of the workflow",
    "For a workflow_run trigger, GitHub uses the workflow file as it exists on the default " +
      "branch, not as it exists in the commit that triggered CI. This surprises people who " +
      "edit a workflow and push to a feature branch expecting to see the change. Edit and " +
      "merge to main to change deploy behaviour.",
    "warn"
  )
  book.h2("The full path from commit to production")
  book.code(
    "git push origin main\n  |\n  +-- CI on ubuntu-latest\n  |     +-- install deps, generate Prisma client\n  |     +-- lint (advisory), typecheck, build\n  |     +-- buildx: app image and migrator image\n  |     +-- docker login ghcr.io using the automatic token\n  |     +-- push both images, tagged with the short SHA\n  |\n  +-- Deploy on the self-hosted runner (this host)\n        +-- checkout the repository\n        +-- resolve the target SHA\n        +-- preflight: engine, paths, TLS material, checkout cleanliness\n        +-- sync the live checkout to the release commit\n        +-- login to GHCR, pull <sha> for app and migrator\n        +-- blue/green rollout, run migrations, healthcheck\n        +-- verify the public health endpoint\n\nElapsed: about 1 minute. Downtime: 0 seconds.",
    { caption: "push to production" }
  )
  book.h2("Why the live checkout is detached")
  book.text(
    "The deploy job checks out the repository into the runner's own workspace, but it then " +
      "syncs a separate, persistent live checkout to the release commit and deploys from " +
      "there. This is because several essential files are gitignored and exist only in the " +
      "real checkout: the production environment file, the TLS material, and the deployment " +
      "state directory."
  )
  book.table(
    ["Path", "In git?", "Held in the live checkout", "Purpose"],
    [
      [".env.docker.cloud", "No", "Yes", "Production credentials and registry settings"],
      ["nginx/ssl/", "No", "Yes", "TLS certificates and keys"],
      [".deploy/", "No", "Yes", "Active slot and last deployed SHA"],
      ["scripts/", "Yes", "Checked out per release", "Pull and rollout logic"],
      ["docker-compose-cloud.yml", "Yes", "Checked out per release", "Service definitions"],
    ],
    { widths: [40, 14, 40, CONTENT_W - 94] }
  )
  book.callout(
    "The deploy refuses to run on a dirty checkout",
    "The sync step checks for uncommitted changes to tracked files and fails deliberately. " +
      "This prevents a deployment from silently discarding work in progress on the host. If a " +
      "deploy fails there, look at git status in the live checkout before anything else.",
    "warn"
  )
book.h1(SECTIONS[4])
  book.text(
    "This section defines the vocabulary used throughout the rest of the document. These " +
      "are the concepts that, once understood, make the remaining chapters mechanical."
  )
  book.h2("Workflow, job, step, runner")
  book.list([
    ["Workflow", "A YAML file in .github/workflows that defines one automated process."],
    ["Job", "A unit of work within a workflow that runs on one machine. Jobs may run in parallel."],
    ["Step", "One command or action inside a job."],
    ["Runner", "The agent that executes a job. Either GitHub-hosted or self-hosted."],
  ])
  book.callout(
    "The runner is the scarce resource",
    "GitHub provides hosted runners on demand. Nobody provides your self-hosted runner. When " +
      "a self-hosted job is queued, GitHub is polling for one of your machines to volunteer. " +
      "This inversion is why a missing runner is a silent, indefinite failure.",
    "info"
  )
  book.h2("Labels")
  book.text(
    "A runs-on field is a label selector. A job runs on a machine only if that machine " +
      "carries every label in the selector. Some labels are assigned automatically by the " +
      "runner itself; the rest you choose at registration time."
  )
  book.table(
    ["Label", "Source", "Meaning"],
    [
      ["self-hosted", "Automatic", "The machine is one you operate, not GitHub"],
      ["linux / windows / macOS", "Automatic", "Operating system of the runner"],
      ["X64 / ARM64", "Automatic", "Processor architecture"],
      ["wsl", "Chosen at registration", "Custom label identifying this deployment host"],
    ],
    { widths: [30, 34, CONTENT_W - 64] }
  )
  book.callout(
    "The copy-paste trap",
    "When GitHub generates a runner registration command for you, it does not add any custom " +
      "label. If your workflow selects a custom label and you copy the generated command " +
      "verbatim, the runner registers without that label and the job will queue forever. Always " +
      "add the label explicitly and then confirm the runner shows it in the UI.",
    "danger"
  )
  book.h2("Containers, images, and the registry")
  book.list([
    ["Image", "An immutable packaged filesystem plus its runtime configuration, built once."],
    ["Container", "A running instance of an image, with its own writable layer."],
    ["Registry", "A remote store of images. Here: ghcr.io, GitHub Container Registry."],
    ["Tag", "A mutable pointer to an image, such as latest or a short commit SHA."],
    ["Digest", "An immutable content hash of an image. The only truly permanent identifier."],
  ])
  book.callout(
    "Deployments pin to the SHA tag, not to latest",
    "latest is a convenience pointer that moves on every publish. A deployment that pulled " +
      "latest could ship different code than the commit that passed CI. Pinning to the short " +
      "SHA makes each release reproducible and auditable.",
    "info"
  )
  book.h2("Authentication vocabulary")
  book.table(
    ["Term", "Meaning in this setup"],
    [
      [
        "GITHUB_TOKEN",
        "Automatic, short-lived credential inside CI. Can publish images on the default branch",
      ],
      ["Personal access token", "A long-lived credential you create, used by the host to pull"],
      ["read:packages", "The permission that makes a personal token able to pull images"],
      ["Package visibility", "Private requires credentials; public can be pulled anonymously"],
    ],
    { widths: [38, CONTENT_W - 38] }
  )
  book.h2("The blue/green deployment model")
  book.text(
    "Two identical application slots, blue and green, run side by side. Only one receives " +
      "traffic. A deployment brings the new release up on the inactive slot, waits for it to " +
      "report healthy, and only then switches the proxy to point at it. The old slot stays " +
      "warm for a period, which is what makes rollback a configuration switch rather than a " +
      "rebuild."
  )
  book.code(
    "release N-1:  traffic -> app-blue      [running]\nrelease N  :  traffic -> app-green     [starting]\n              app-blue still running, idle\n              healthcheck passes\n              switch: traffic -> app-green\n              app-blue drains, then stops\n\nrollback   :  traffic -> app-blue      [already running, immediate]",
    { caption: "blue/green rollout and rollback" }
  )
  book.callout(
    "Rollback is a human decision by design",
    "There is intentionally no automated rollback. Recovering from a bad release is a " +
      "judgement call about business impact, and automating it removes the decision from the " +
      "people best placed to make it. The rollback path remains a single command.",
    "info"
  )
book.h1(SECTIONS[5])
  book.text(
    "This is the master procedure. It is ordered by dependency, not by importance: each " +
      "stage depends on the previous one being complete, and completing them out of order is " +
      "how the incident in section 2 happened."
  )
  book.callout(
    "Do not skip ahead",
    "Each stage has a verification command. Run it. A stage that is not verified is not " +
      "complete, and the next stage will fail in a way that looks like the next stage's " +
      "problem. Budget roughly 45 minutes for a full pass on a new host.",
    "warn"
  )
  book.h2("Dependency order at a glance")
  book.table(
    ["Stage", "Must be true before you start", "Verified by"],
    [
      ["1. Repository", "Workflow files merged to main", "CI runs on a test push"],
      ["2. Registry", "An image has been published once", "A pull of that tag succeeds"],
      ["3. Config", "STACK_DIR and GHCR values set", "Preflight step passes"],
      ["4. Runner", "Engine is running and reachable", "Runner shows Idle in the UI"],
      ["5. Engine", "Docker Desktop integration attached", "docker info returns a version"],
      ["6. Deploy", "All of the above green", "make health reports status ok"],
    ],
    { widths: [30, 56, CONTENT_W - 86] }
  )
  book.h2("The 45-minute pass, end to end")
  book.checklist("Canonical auto-deploy setup", [
    [
      "Verify the engine first",
      "docker info must return a server version. Nothing else can work until this does.",
    ],
    [
      "Verify the live checkout is clean",
      "cd STACK_DIR && git status --porcelain --untracked-files=no must be empty.",
    ],
    [
      "Confirm required host assets exist",
      ".env.docker.cloud, nginx/ssl, and .deploy/ must all be present in the live checkout.",
    ],
    [
      "Confirm script execute permissions",
      "ls -l scripts/*.sh - every script that compose mounts must show mode 755.",
    ],
    [
      "Register the self-hosted runner",
      "With every label the deploy workflow selects, including the custom one.",
    ],
    [
      "Install the runner as a service",
      "Otherwise it dies with the session and every deploy silently stalls.",
    ],
    [
      "Confirm the runner is online",
      "Settings > Actions > Runners must show it as Idle with the correct labels.",
    ],
    [
      "Set the registry variables and secrets",
      "In the correct stores: variables for paths, secrets for credentials.",
    ],
    [
      "Prove the registry pull works",
      "docker pull of the exact repository and tag the deploy will request.",
    ],
    [
      "Trigger the deploy",
      "Actions > Deploy > Run workflow, leaving the SHA input blank.",
    ],
    [
      "Verify from outside",
      "make health must report status ok after the rollout completes.",
    ],
  ])

  book.h1(SECTIONS[6])
  book.text(
    "Stage 1 covers the parts that live in the repository: the workflow files themselves, and " +
      "the preconditions they encode."
  )
  book.h2("What the CI workflow must do")
  book.table(
    ["Requirement", "Implementation", "Why it matters"],
    [
      ["Build on every push", "runs-on ubuntu-latest", "Catches breakage before it reaches main history"],
      ["Typecheck", "npx tsc --noEmit", "A build alone can succeed with type errors in tests"],
      ["Generate the database client", "npx prisma generate with a dummy DATABASE_URL", "Client is not committed"],
      ["Publish only from main", "publish flag set on push to main only", "Pull requests must not publish"],
      ["Tag with the short SHA", "sha_short from GITHUB_SHA", "The tag the deploy will pin to"],
    ],
    { widths: [36, 56, CONTENT_W - 92] }
  )
  book.callout(
    "Lint is advisory in this repository",
    "The CI workflow runs lint with a trailing '|| true' because the codebase has pre-existing " +
      "lint errors. Only typecheck and build will actually fail a pull request today. Do not " +
      "assume a green CI run means lint passed.",
    "warn"
  )
  book.h2("What the deploy workflow must do")
  book.list([
    ["Fire only after CI succeeds", "workflow_run trigger plus a conclusion check"],
    ["Run on the production host", "A self-hosted runner, never a hosted one"],
    ["Pin the artifact", "Short SHA tag, never latest"],
    ["Refuse to deploy a dirty host", "Explicit cleanliness check before syncing"],
    ["Verify after rollout", "Health endpoint check outside the container network"],
    ["Summarise", "Write a step summary so the run is readable after the fact"],
  ])
  book.h2("Verifying the files are actually live")
  book.text(
    "Because a workflow_run-triggered workflow runs the version on the default branch, " +
      "editing a workflow on a feature branch changes nothing. Verify what is actually in " +
      "force rather than what is in your working copy."
  )
  book.code(
    "# what the default branch will run\ngit fetch origin\ngit show origin/main:.github/workflows/deploy.yml | head -40\n\n# confirm the trigger name matches CI exactly\n# the string inside workflows: [\"CI\"] must equal the `name:` field of ci.yml",
    { caption: "verifying the live workflow definition" }
  )
  book.callout(
    "The trigger name must match the workflow name exactly",
    "If ci.yml declares 'name: CI' then the deploy trigger must say 'CI'. A mismatch is not " +
      "an error: the workflow simply never triggers, and you will sit waiting for a deploy " +
      "that was never going to arrive.",
    "danger"
  )
book.h1(SECTIONS[7])
  book.text(
    "The registry is where CI publishes and the host pulls. Getting this wrong produces a " +
      "confusing family of errors, so it is worth being precise."
  )
  book.h2("How the package gets created")
  book.text(
    "There is nothing to create by hand. The first time CI successfully pushes to " +
      "ghcr.io with the repository's own name, GitHub creates the package automatically. " +
      "Before that first successful publish, no pull can possibly work."
  )
  book.code(
    "# in ci.yml - this is what creates the package\ndocker login ghcr.io\n  username: ${{ github.actor }}\n  password: ${{ secrets.GITHUB_TOKEN }}\n\ntags: |\n  ghcr.io/ebissamideksa/asset-tracking:${{ sha_short }}\n  ghcr.io/ebissamideksa/asset-tracking:latest",
    { caption: "CI publish step" }
  )
  book.callout(
    "CI can publish without any credential you create",
    "The automatic GITHUB_TOKEN is sufficient to push images on the default branch. This is " +
      "why CI succeeds while the host fails: the two sides authenticate in completely " +
      "different ways, and only the pull side needs your personal token.",
    "info"
  )
  book.h2("Choosing package visibility")
  book.table(
    ["Visibility", "Pull requires", "Recommendation"],
    [
      [
        "Private (default)",
        "A token with package read permission",
        "Recommended. Keeps compiled application code private",
      ],
      ["Public", "Nothing", "Simpler, but the image becomes world-readable"],
    ],
    { widths: [28, 52, CONTENT_W - 80] }
  )
  book.callout(
    "How to tell whether a package is public",
    "Ask the registry for an anonymous token. If it refuses with 'authentication required', " +
      "the package is private and the host needs credentials.",
    "info"
  )
  book.code(
    "R=ebissamideksa/asset-tracking\ncurl -s \"https://ghcr.io/token?scope=repository:$R:pull&service=ghcr.io\"\n\n# private  -> {\"errors\":[{\"code\":\"UNAUTHORIZED\",\"message\":\"authentication required\"}]}\n# public   -> {\"token\":\"eyJ...\"}",
    { caption: "probing package visibility without a credential" }
  )
  book.h2("Creating a token that can actually pull")
  book.text(
    "A personal access token must carry the package read permission. This is the single most " +
      "commonly missed setting, and its absence produces a denial that looks like a bad " +
      "username or a wrong repository name."
  )
  book.table(
    ["Token type", "Required setting", "Note"],
    [
      [
        "Fine-grained",
        "Permissions > Packages: Read",
        "Preferred. Narrower scope, per-repository",
      ],
      ["Classic", "read:packages checkbox", "Works, but the checkbox is easy to miss"],
    ],
    { widths: [26, 46, CONTENT_W - 72] }
  )
  book.code(
    "cd /home/ebissamideksa/tracking\n# edit GHCR_TOKEN= in .env.docker.cloud, then:\nmake login\n\n# the decisive test - an actual pull of the exact tag\ndocker pull ghcr.io/ebissamideksa/asset-tracking:<short-sha>",
    { caption: "prove registry access properly" }
  )
  book.callout(
    "Two separate tests, in order",
    "Login success only proves your credentials are well formed. It does not prove the token " +
      "can read your packages. Always follow a successful login with a real pull of the exact " +
      "repository and tag before declaring the registry stage complete.",
    "danger"
  )
  book.h2("Transcription hazards")
  book.text(
    "Registry coordinates are transcribed by hand in several places, and small differences " +
      "produce identical-looking denials."
  )
  book.list([
    ["The owner name must match the repository owner exactly", "A typo looks exactly like a permissions failure"],
    ["The image name is not the same as the repository name", "This project appends -migrator for the second image"],
    ["The tag is the short SHA, not the full SHA", "Check the CI summary for the exact published tag"],
  ])
  book.callout(
    "How to compare names safely",
    "The most reliable comparison is programmatic: extract the repository owner from the " +
      "remote URL and compare it to the IMAGE_REPO value in the environment file, rather than " +
      "eyeballing two strings. A single extra letter in the owner name produces a denial that " +
      "is indistinguishable from a permissions problem by eye.",
    "info"
  )
  book.code(
    "# compare the real owner against what the deploy will use\ngit remote get-url origin\ncut -d: -f2- <<< \"$(git remote get-url origin)\" | sed 's#github.com/##; s#\\.git$##'\n\ngrep '^IMAGE_REPO=' .env.docker.cloud",
    { caption: "verifying the registry coordinates" }
  )
book.h1(SECTIONS[8])
  book.text(
    "GitHub exposes two separate stores for pipeline configuration. They are visually " +
      "adjacent in the interface and behave completely differently at runtime. This section " +
      "exists because the distinction cost the most time in the incident."
  )
  book.h2("The two stores")
  book.table(
    ["", "Variables", "Secrets"],
    [
      ["Referenced as", "vars.NAME", "secrets.NAME"],
      ["Visible in the UI", "Yes, in plain text", "No, write-only after saving"],
      ["Encrypted at rest", "No", "Yes"],
      ["Available to fork PRs", "Yes", "No"],
      ["Correct use", "Paths, labels, non-sensitive configuration", "Tokens, passwords, keys"],
      ["UI URL segment", "/settings/actions/variables", "/settings/actions/secrets"],
    ],
    { widths: [36, 44, CONTENT_W - 80] }
  )
  book.callout(
    "The two pages differ by one word in the URL",
    "This is why the mistake is so durable. The headings read 'Secrets' and 'Variables', " +
      "they sit side by side in the interface, and the forms are nearly identical. Bookmark " +
      "the variables URL now and use it every time.",
    "danger"
  )
  book.h2("What happens when you get it wrong")
  book.text(
    "A secret referenced as a variable, or a variable referenced as a secret, expands to an " +
      "empty string. It does not raise an error, it does not warn, and it does not fail at " +
      "parse time. The workflow runs, the step runs, and the value is simply gone. This is " +
      "why the symptom is so indirect."
  )
  book.code(
    "# this reads vars.STACK_DIR - empty if stored under Secrets\nenv:\n  STACK_DIR: ${{ vars.STACK_DIR }}\n\n# these read secrets - empty if stored under Variables\nenv:\n  GHCR_USERNAME: ${{ secrets.GHCR_USERNAME }}\n  GHCR_TOKEN:   ${{ secrets.GHCR_TOKEN }}",
    { caption: "the references that must match the stores" }
  )
  book.h2("The complete inventory for this repository")
  book.table(
    ["Name", "Store", "Required?", "Value or note"],
    [
      ["STACK_DIR", "Variables", "Yes", "Absolute path to the live checkout"],
      ["DEPLOY_RUNNER_LABELS", "Variables", "No", "JSON label array; defaults to the wsl list"],
      ["GHCR_USERNAME", "Secrets", "Recommended", "Registry account name"],
      ["GHCR_TOKEN", "Secrets", "If private", "Token with package read permission"],
    ],
    { widths: [40, 22, 22, CONTENT_W - 84] }
  )
  book.callout(
    "STACK_DIR is required and has no default",
    "The preflight step exits immediately when STACK_DIR is empty. Because the failure takes " +
      "about twenty milliseconds, it is easy to miss in a long log. If a deploy fails within " +
      "the first second of its first real step, suspect this variable before anything else.",
    "warn"
  )
  book.h2("Two configuration locations, deliberately")
  book.text(
    "Registry credentials exist in two places by design. The workflow passes them as job-level " +
      "environment variables from the secret store. The login helper falls back to reading them " +
      "from the live checkout's environment file when those are empty. This means either " +
      "location is sufficient, which is convenient, but it also means a stale copy in one " +
      "place can mask an update in the other."
  )
  book.code(
    "# in scripts/registry-login.sh\nGHCR_USERNAME=\"${GHCR_USERNAME:-$(read_env GHCR_USERNAME)}\"\nGHCR_TOKEN=\"${GHCR_TOKEN:-$(read_env GHCR_TOKEN)}\"",
    { caption: "the fallback that makes both locations work" }
  )
  book.callout(
    "Rotate both copies",
    "When a registry token is replaced, update the environment file and the repository secret. " +
      "Updating only one is a frequent cause of a deploy that works interactively but fails in " +
      "automation, or the reverse.",
    "warn"
  )
  book.h2("Auditing what is actually set")
  book.text(
    "You cannot read a secret back, but you can always confirm that an expression is empty by " +
      "adding a temporary guard step. This is the fastest way to settle a 'is it set' question " +
      "without guessing."
  )
  book.code(
    "- name: Diagnose configuration\n  run: |\n    echo \"STACK_DIR=[${{ vars.STACK_DIR }}]\"\n    echo \"RUNNER_LABELS=[${{ vars.DEPLOY_RUNNER_LABELS }}]\"\n    echo \"GHCR_USERNAME set: ${{ secrets.GHCR_USERNAME != '' }}\"\n    echo \"GHCR_TOKEN set:   ${{ secrets.GHCR_TOKEN != '' }}\"",
    { caption: "a temporary diagnostic step" }
  )
book.h1(SECTIONS[9])
  book.text(
    "The runner is the component that turns a queued job into a running job. It has four " +
      "distinct states, and conflating them is the root cause of the original incident."
  )
  book.h2("The four states")
  book.table(
    ["State", "Evidence on the host", "Job outcome"],
    [
      ["Downloaded", "Tarball or extracted files", "Queued forever. Nobody knows this host exists"],
      ["Registered", ".runner and .credentials present", "Queued until started"],
      ["Running", "Runner.Listener process present", "Picked up automatically"],
      ["Installed as a service", "systemd unit active", "Survives reboots and sessions"],
    ],
    { widths: [32, 50, CONTENT_W - 82] }
  )
  book.callout(
    "The filesystem shows you the first two states only",
    "The .runner and .credentials files tell you registration happened. They cannot tell you " +
      "whether the runner is currently listening. Only a process check or the GitHub UI can " +
      "answer that.",
    "info"
  )
  book.h2("Registering the runner")
  book.text(
    "Generate a registration token from the repository settings, then run the configuration " +
      "script on the host. The token is short-lived and single-purpose; treat it as a " +
      "credential and do not paste it into tickets or chat."
  )
  book.code(
    "cd ~/tracking/actions-runner\n\n./config.sh \\\n  --url https://github.com/EbissaMideksa/asset-tracking \\\n  --token <REGISTRATION_TOKEN> \\\n  --labels wsl \\\n  --unattended \\\n  --replace",
    { caption: "registration - note the explicit custom label" }
  )
  book.callout(
    "Never share a registration token",
    "During the incident a live registration token was pasted into a conversation. Tokens are " +
      "short-lived, but the habit is worth unlearning: registration tokens are credentials, " +
      "they should be typed directly at the prompt, and they should be discarded after use.",
    "danger"
  )
  book.h2("Confirming registration")
  book.code(
    "ls -a ~/tracking/actions-runner | grep -E '^\\.'\n# expect .runner and .credentials among the dotfiles\n\ncat ~/tracking/actions-runner/.runner\n# contains agentId, agentName, poolName, serverUrl, workFolder",
    { caption: "proving registration happened" }
  )
  book.callout(
    "Labels are not stored on the runner",
    "The .runner file does not contain the label list, because labels live on the GitHub " +
      "server. An absent label in that file is not evidence of a missing label. To verify " +
      "labels, read the Runners page in the repository settings.",
    "warn"
  )
  book.h2("Running it manually, then as a service")
  book.text(
    "Running the runner directly is useful for a quick test but is the wrong end state: the " +
      "process dies with the shell session, and with it the ability to deploy. Install it as " +
      "a systemd service instead."
  )
  book.code(
    "# temporary, for testing only\n./run.sh\n\n# the correct end state\nsudo ./svc.sh install\nsudo ./svc.sh start\n\n# verify\nsystemctl is-active actions.runner.*",
    { caption: "temporary start versus durable start" }
  )
  book.callout(
    "A service that is installed but not started is a common half-state",
    "Installing the unit and starting it are two separate operations, and it is easy to run " +
      "the first, be interrupted, and assume both happened. Always follow install with start " +
      "and then confirm with systemctl is-active. An inactive unit reports as installed but " +
      "picks up nothing.",
    "warn"
  )
  book.h2("Reading the runner log")
  book.text(
    "The runner writes a plain-text log that is far more informative than the Actions UI " +
      "during a stuck job. It states exactly what the runner is doing at each moment."
  )
  book.code(
    "Connected to GitHub\nCurrent runner version: '2.337.0'\nListening for Jobs                 <- healthy, waiting\nRunning job: Pull artifact and deploy\nJob completed with result: Failed  <- the job ran and failed",
    { caption: "what a healthy runner log looks like" }
  )
  book.callout(
    "Listening for Jobs is the signal you want",
    "If this line is absent, the runner is not reaching GitHub. If it is present and the job is " +
      "still queued in the UI, the problem is a label mismatch or a repository setting, not " +
      "the runner's connectivity.",
    "ok"
  )
book.h1(SECTIONS[10])
  book.text(
    "On this project the container engine is Docker Desktop running on Windows, with its " +
      "socket projected into the WSL2 distribution. That arrangement has a failure mode that " +
      "native Linux does not: the two halves can be running while the connection between " +
      "them is broken."
  )
  book.h2("The architecture")
  book.code(
    "Windows host\n  +-- Docker Desktop (the actual container engine)\n        |  projects a socket into WSL at\n        v\nWSL2 distro (Ubuntu)\n  /var/run/docker.sock   <- what the CLI and the runner talk to\n  docker CLI, compose, your deploy scripts",
    { caption: "Docker Desktop and WSL2" }
  )
  book.h2("The two failure modes")
  book.table(
    ["Symptom", "Underlying cause", "Fix"],
    [
      ["Socket path missing", "Docker Desktop not running", "Start Docker Desktop"],
      [
        "Socket path present but empty directory",
        "WSL integration detached from the distro",
        "Re-enable WSL integration and restart",
      ],
    ],
    { widths: [48, 48, CONTENT_W - 96] }
  )
  book.callout(
    "The empty-directory socket is the confusing one",
    "When WSL integration detaches, a placeholder path may remain under the bind-mount " +
      "directory, and it looks like a socket at a glance. It is actually an empty directory. " +
      "Confirm with stat before concluding that a socket exists and works.",
    "warn"
  )
  book.code(
    "# authoritative check - does a working socket exist?\nls -la /var/run/docker.sock\ndocker info --format '{{.ServerVersion}}'\n\n# if the path is missing, inspect the bind mount\nls -la /mnt/wsl/docker-desktop-bind-mounts/\nstat -c '%n = %F' /mnt/wsl/docker-desktop-bind-mounts/*/docker.sock",
    { caption: "diagnosing the engine connection" }
  )
  book.h2("Why the CLI can succeed while the daemon is unreachable")
  book.text(
    "This distinction caused a misleading diagnosis. The preflight check uses 'command -v " +
      "docker', which only tests whether the client binary exists on the filesystem. It passes " +
      "happily when the daemon behind it is dead. A real connection test asks the daemon."
  )
  book.code(
    "# tests only that the binary exists - passes when the daemon is dead\ncommand -v docker\n\n# tests that the daemon actually answers - this is the real check\ndocker info >/dev/null 2>&1 && echo 'engine reachable' || echo 'engine NOT reachable'",
    { caption: "client present versus daemon reachable" }
  )
  book.callout(
    "A preflight that tests the wrong thing reports the wrong outage",
    "Because the check passed, the pipeline advanced and failed later at the image pull step, " +
      "reporting a registry error. The build was red and the message was wrong. A preflight " +
      "that asked the daemon would have failed immediately and named the true cause.",
    "danger"
  )
  book.h2("Making the engine survive a restart")
  book.code(
    "# Windows: Settings > Docker Desktop > General\n#   [x] Start Docker Desktop when you sign in\n\n# Windows: Settings > Apps > Optional features > Virtual Machine Platform\n#   [x] Enable the Windows Subsystem for Linux\n\n# WSL: /etc/wsl.conf\n[boot]\nsystemd=true\n[network]\ngenerateResolvConf=false",
    { caption: "the two settings that prevent silent outages" }
  )
  book.callout(
    "wsl --shutdown takes everything down",
    "Stopping the WSL virtual machine stops the whole distribution: the engine socket, every " +
      "container, and any non-service process such as a runner started by hand. Enabling " +
      "systemd and installing both the engine and the runner as services is what makes this " +
      "recoverable.",
    "info"
  )
  book.h2("Container inventory and why only one publishes ports")
  book.text(
    "Every service runs on a private bridge network. Only the reverse proxy publishes ports to " +
      "the host. This means a single container failing can make the entire application " +
      "unreachable while every other container reports healthy."
  )
  book.table(
    ["Service", "Host port", "Consequence if it fails"],
    [
      ["nginx", "80, 443", "Application completely unreachable, everything else still looks fine"],
      ["db", "loopback 5433", "App unhealthy, health endpoint reports db false"],
      ["redis", "loopback 6380", "App degraded, sessions and live events affected"],
      ["app-blue / app-green", "none", "Internal only; nginx selects the active slot"],
      ["grafana", "loopback 3001", "Monitoring dark, application unaffected"],
    ],
    { widths: [34, 28, CONTENT_W - 62] }
  )
  book.h2("Entrypoint scripts and file permissions")
  book.text(
    "The reverse proxy mounts a script from the host into its startup directory. That script " +
      "reads the active slot marker and generates the upstream configuration at boot. Because " +
      "it is bind-mounted, its permissions are the host's permissions."
  )
  book.code(
    "volumes:\n  - ./scripts/nginx-upstream.sh:/docker-entrypoint.d/00-upstream.sh:ro",
    { caption: "the mount that made the proxy fail" }
  )
  book.callout(
    "Exit 127 always means 'command not found'",
    "When a container exits with status 127, read it as: the entrypoint tried to execute " +
      "something that was not there or not runnable. In this project that something is a " +
      "host-mounted script that lost its executable bit. The fix is chmod +x on the host, and " +
      "it must also be correct in git so it survives a fresh clone.",
    "danger"
  )
book.h1(SECTIONS[11])
  book.text(
    "This chapter is the acceptance test. Every earlier stage must be green before any of it " +
      "matters."
  )
  book.h2("Pre-flight gate, in order")
  book.checklist("Before triggering a deploy", [
    ["Engine reachable", "docker info returns a server version"],
    ["Runner active", "systemctl is-active actions.runner.* returns active"],
    ["Runner online in the UI", "Runners page shows Idle with the wsl label"],
    ["Registry pull works", "A real docker pull of the release tag succeeds"],
    ["Live checkout clean", "git status --porcelain --untracked-files=no is empty"],
    ["Host assets present", "Environment file, TLS directory, and deploy state directory exist"],
    ["Script permissions correct", "Every mounted startup script is mode 755"],
  ])
  book.h2("Triggering the deploy")
  book.text(
    "A deploy is triggered either automatically, by the successful completion of CI, or " +
      "manually from the Actions tab. Manual dispatch is the right tool for a first " +
      "verification, because it isolates deployment problems from build problems."
  )
  book.code(
    "Actions tab > Deploy workflow > Run workflow\n\n  branch: main\n  sha:   (leave blank)\n\nLeaving the SHA blank resolves the target from the last successful CI run.",
    { caption: "manual dispatch" }
  )
  book.callout(
    "Do not cancel a queued job out of habit",
    "A job that is queued because the runner was offline will be picked up automatically the " +
      "moment a matching runner comes online. Cancelling and re-running loses the " +
      "concurrency slot and changes nothing else. Fix the runner and wait.",
    "info"
  )
  book.h2("Watching the rollout")
  book.text(
    "The job takes roughly a minute. The order of its steps is a useful diagnostic, because " +
      "the step that fails tells you which stage is still broken."
  )
  book.table(
    ["Order", "Step", "If this is the last step to run", "The problem is"],
    [
      ["1", "Checkout", "Repository or network access", "Workflow or connectivity"],
      ["2", "Resolve target SHA", "SHA resolution", "Trigger or input wiring"],
      ["3", "Preflight", "Configuration or host assets", "Variables or missing files"],
      ["4", "Sync live checkout", "Uncommitted changes on host", "A dirty live checkout"],
      ["5", "Pull artifact", "Registry credentials", "Token scope or package name"],
      ["6", "Deploy", "Engine, compose, migrations", "Container engine or compose"],
      ["7", "Verify health", "The application itself", "A genuine application fault"],
    ],
    { widths: [14, 34, 62, CONTENT_W - 110], fontSize: 7.6, headSize: 8 }
  )
  book.h2("Acceptance criteria")
  book.callout(
    "The deploy is only successful when the outside world agrees",
    "A green build means the steps exited zero. It does not mean users can reach the " +
      "application. Always confirm from outside the container network before declaring a " +
      "release good.",
    "ok"
  )
  book.code(
    "cd /home/ebissamideksa/tracking\nmake health\n\n# expect:\n# {\n#     \"status\": \"ok\",\n#     \"checks\": { \"db\": true, \"redis\": true },\n#     \"timestamp\": \"...\"\n# }",
    { caption: "external verification" }
  )
  book.h2("Confirming which release is live")
  book.code(
    "cat .deploy/active        # which slot is taking traffic\ncat .deploy/last-sha      # which commit is deployed\nmake deploy-status        # both of the above, plus rollback target",
    { caption: "release state" }
  )
  book.callout(
    "Reconcile the deployed SHA against the CI run",
    "If .deploy/last-sha does not match the commit you intended to release, something " +
      "deployed an older artifact. Check that the CI run that triggered the deploy actually " +
      "published the image, and that the short SHA used as the tag matches the one in the " +
      "image repository.",
    "warn"
  )
  book.h2("A note on repeatability")
  book.text(
    "A successful manual dispatch does not prove that automatic deployment works. The " +
      "manual path bypasses the workflow_run trigger and can therefore succeed even if the " +
      "trigger itself is misconfigured. The only true test of auto-deploy is pushing a commit " +
      "to main and watching the deploy happen without any human action."
  )
  book.checklist("Proving auto-deploy end to end", [
    ["Push a no-op commit to main", "For example a comment-only change"],
    ["Watch CI run and pass", "This is the normal part"],
    ["Watch Deploy start with no human action", "This is the part being proven"],
    ["Confirm the deployed SHA advanced", "cat .deploy/last-sha"],
    ["Confirm the application is healthy", "make health"],
    ["Only then declare auto-deploy working", "Manual dispatch alone is not sufficient evidence"],
  ])
book.h1(SECTIONS[12])
  book.text(
    "Each entry below follows the same shape: what you see, how to confirm it, what it " +
      "actually means, and what to do. These are the failures observed on this project, " +
      "written so that the next occurrence takes minutes rather than hours."
  )

  book.h2("Deploy stuck in Queued indefinitely")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Status Queued, duration shown as a dash, no step ever starts"],
      ["Confirm", "Settings > Actions > Runners: no runner, or runner offline"],
      ["Cause", "No self-hosted runner available to execute the job"],
      ["Fix", "Register a runner with the required labels, then install it as a service"],
      ["Prevention", "A scheduled check that fails when no runner is online"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )
  book.callout(
    "Do not wait, and do not re-run",
    "This state never resolves on its own. Adding timeout-minutes does not help because the " +
      "timeout does not begin until the job starts. Re-running creates another queued job " +
      "behind the same concurrency group.",
    "danger"
  )

  book.h2("Job runs and fails almost instantly at preflight")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Fails in well under a second, on the first substantive step"],
      ["Confirm", "Check whether STACK_DIR is set as a Variable, not a Secret"],
      ["Cause", "A required variable is empty because it was stored in the wrong place"],
      ["Fix", "Move it to the Variables tab; re-run"],
      ["Prevention", "Add a diagnostic step that prints which values resolved"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )

  book.h2("Deploy fails at the image pull step")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Fails in about a second with denied or unauthorized"],
      ["Confirm", "Run the pull by hand; then run make login"],
      ["Cause 1", "Container engine is not running, so the pull cannot reach a daemon"],
      ["Cause 2", "Token lacks the package read permission"],
      ["Cause 3", "Repository or owner name is mistyped"],
      ["Fix", "Start the engine; grant the token the missing scope; verify names"],
      ["Prevention", "Check the engine in preflight, not just the client binary"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )
  book.callout(
    "Registry login can succeed while pulls are denied",
    "The authentication endpoint only validates that credentials are well formed. A " +
      "successful login proves nothing about package access. Always follow it with a real " +
      "pull of the exact tag.",
    "warn"
  )

  book.h2("Application unreachable while every container reports healthy")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Eight healthy containers, nothing listening on 80 or 443"],
      ["Confirm", "docker ps -a --filter name=nginx, and read the exit status"],
      ["Cause", "Proxy exited, usually 127, from a non-executable mounted script"],
      ["Fix", "chmod +x the mounted script on the host, then start the container"],
      ["Prevention", "Check the file mode in git; verify externally, not just health"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )
  book.callout(
    "Container health checks do not test reachability",
    "A healthy container reports on its own internal state. Nothing in that model knows " +
      "whether the proxy publishes a working port. Reachability must be tested from outside.",
    "danger"
  )
book.h2("Everything worked, then everything stopped after a restart")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "After a reboot or wsl shutdown, nothing runs and no deploy is possible"],
      ["Confirm", "uptime shows a recent boot; engine socket missing; no runner process"],
      ["Cause", "Engine and runner were both started by hand, not as services"],
      ["Fix", "Start the engine; install and start the runner as a service"],
      ["Prevention", "Enable auto-start for Docker Desktop and systemd for the runner"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )

  book.h2("Deploy refuses to sync the live checkout")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Fails at the sync step, listing uncommitted changes"],
      ["Confirm", "git status --porcelain --untracked-files=no in the live checkout"],
      ["Cause", "Someone edited a tracked file on the host"],
      ["Fix", "Commit the change upstream, or discard it deliberately"],
      ["Note", "This guard is intentional and protects against silent data loss"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )
  book.callout(
    "Do not reflexively discard the changes",
    "The host checkout may contain a configuration change that was never pushed. Read the " +
      "diff before removing anything. A commit made only on the production host is a change " +
      "that a future release will silently erase.",
    "warn"
  )

  book.h2("Deploy triggered but never appears")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "CI succeeds but no Deploy run is created at all"],
      ["Confirm", "Compare the CI workflow name against the trigger's workflow list"],
      ["Cause", "Name mismatch, or the commit was not on main"],
      ["Fix", "Align the names exactly; deploy only from main"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )

  book.h2("Deploy queued behind an earlier stuck deploy")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Several deploy runs queued, none starting"],
      ["Confirm", "Look for an earlier run still holding the concurrency group"],
      ["Cause", "A previous run is stuck, and cancel-in-progress is false by design"],
      ["Fix", "Clear the blocking run by fixing whatever is holding it"],
      ["Note", "Serialising deploys is deliberate: two concurrent rollouts are worse"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )

  book.h2("Workflow edited but behaviour unchanged")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "A change to the workflow has no effect on behaviour"],
      ["Confirm", "git show origin/main:.github/workflows/deploy.yml"],
      ["Cause", "The trigger runs the default branch version, not your branch"],
      ["Fix", "Merge the change to main before expecting it to take effect"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )

  book.h2("Migration fails during rollout")
  book.table(
    ["Aspect", "Detail"],
    [
      ["Symptom", "Deploy fails after the pull, during the migration step"],
      ["Confirm", "Read the migrator container logs"],
      ["Cause", "An unapplied or conflicting database migration"],
      ["Fix", "Resolve the migration; a half-applied migration may require manual repair"],
    ],
    { widths: [24, CONTENT_W - 24] }
  )
  book.callout(
    "Migrations are the least reversible step in a deploy",
    "Code can be rolled back instantly; a schema change cannot. This is why the blue/green " +
      "switch happens only after migrations succeed, and why migrations must be written to " +
      "be backward compatible with the release still serving traffic.",
    "danger"
)

  book.h2("An annotated successful run")
book.h2("An annotated successful run")
  book.text(
    "The following is what a healthy deployment looks like, step by step. Knowing the shape " +
      "of a good run makes an abnormal one obvious, and it is far easier to recognise than " +
      "to reconstruct from memory during an incident."
  )
  book.code(
    "[workflow_run] Evaluating deploy.if\n  Result: true                          <- CI succeeded, so deploy is allowed\n\n[runner] Connected to GitHub\n[runner] Listening for Jobs\n[runner] Running job: Pull artifact and deploy\n\nstep 1  checkout .................. succeeded\nstep 2  Resolve target SHA ........ succeeded   release = b7250cb\nstep 3  Preflight ................ succeeded   engine OK, STACK_DIR OK, TLS OK\nstep 4  Sync live checkout ........ succeeded   live checkout now at b7250cb\nstep 5  Pull artifact from GHCR ... succeeded   both images pulled\nstep 6  Deploy blue/green ......... succeeded   migrations applied, slot switched\nstep 7  Verify health ............. succeeded   status ok, db true, redis true\nstep 8  Summary ................... succeeded\n\nJob completed with result: Succeeded   Total duration: about 60s",
    { caption: "a healthy deploy, annotated" }
  )
  book.h2("What each step proves")
  book.table(
    ["Step", "Proves", "If it fails, look at"],
    [
      ["checkout", "The runner can reach the repository", "Runner credentials or network"],
      ["Resolve target SHA", "The trigger is wired correctly", "The workflow_dispatch input"],
      ["Preflight", "Configuration and host assets are present", "Variables, TLS, engine"],
      ["Sync live checkout", "The host is clean and can reach the release commit", "git status on the host"],
      ["Pull artifact", "Registry credentials and package access", "Token scope, package name"],
      ["Deploy", "The engine and compose can roll the release out", "Migrations, compose, engine"],
      ["Verify health", "The application actually serves", "The application itself"],
    ],
    { widths: [30, 60, CONTENT_W - 90], fontSize: 7.8, headSize: 8 }
  )
  book.callout(
    "The last step is the only one that proves the release is usable",
    "Steps 1 to 6 can all succeed while the application serves errors. Step 7 exercises the " +
      "application over the network from outside the container network. Treat it, not the " +
      "green tick, as the definition of done.",
    "ok"
  )
  book.h2("Reading the step summary")
  book.text(
    "A well-behaved workflow writes a short summary into the run page. It is the fastest way " +
      "to confirm after the fact which release went live without opening logs."
  )
  book.code(
    "### Deploy\n\n- commit:  `b7250cb`\n- release: `b7250cb`\n- status:  success\n\n### Published to GHCR\n\n- app:       `ghcr.io/ebissamideksa/asset-tracking:b7250cb`\n- migrator:  `ghcr.io/ebissamideksa/asset-tracking-migrator:b7250cb`",
    { caption: "the run summary" }
  )
  book.h2("What a rerun does and does not do")
  book.table(
    ["Action", "Effect", "Use when"],
    [
      ["Re-run all jobs", "Repeats every step from the same commit", "A transient failure, such as a network blip"],
      ["Re-run failed jobs", "Repeats only the failed step", "Almost never correct for this pipeline"],
      ["Re-run with a SHA input", "Deploys a different, already-built release", "Returning to a known-good version"],
      ["Push a new commit", "Triggers CI, which triggers deploy", "Shipping an actual change"],
    ],
    { widths: [34, 58, CONTENT_W - 92], fontSize: 7.8, headSize: 8 }
  )
  book.callout(
    "Re-running does not rebuild anything",
    "A rerun pulls the same immutable SHA tag again. It cannot fix a bad build, because the " +
      "artifact is unchanged. If the build itself is wrong, push a fix; do not rerun.",
    "warn"
  )
  book.h2("Timing expectations")
  book.table(
    ["Phase", "Expected", "A red flag"],
    [
      ["Job pickup after the runner is online", "Under 30 seconds", "Still queued after 2 minutes"],
      ["Checkout and preflight", "About 5 seconds", "Failing here is always configuration"],
      ["Image pull", "10 to 60 seconds", "Failing in about 1 second means denial, not size"],
      ["Migrations", "5 to 30 seconds", "Any failure needs reading, do not rerun blindly"],
      ["Health check", "Under 30 seconds", "Timeout means the app is not serving"],
    ],
    { widths: [56, 40, CONTENT_W - 96] }
  )
  book.callout(
    "A one-second failure is a denial, not a slow download",
    "Elapsed time is a reliable classifier at the extremes. A pull that fails in about a " +
      "second never downloaded anything; it was refused. A pull that fails after a minute " +
      "was transferring data. This heuristic holds up well under pressure.",
    "info"
  )

book.h1(SECTIONS[13])
  book.text(
    "The GitHub Actions interface is optimised for the common case, which makes it a poor " +
      "diagnostic tool for the uncommon one. This chapter documents the places where the " +
      "actual evidence lives."
  )
  book.h2("The diagnostic hierarchy")
  book.table(
    ["Source", "Answers", "Cost"],
    [
      ["Actions UI, Annotations tab", "Which check emitted an error message", "Seconds"],
      ["Actions UI, step summary", "What the job decided to report", "Seconds"],
      ["Runner log on the host", "Whether the runner is healthy and connected", "Seconds"],
      ["Worker diagnostic log", "Which step failed and with what exit code", "One minute"],
      ["Container state and logs", "Whether the application itself is working", "One minute"],
      ["The workflow source", "What the job was actually trying to do", "Two minutes"],
    ],
    { widths: [46, 62, CONTENT_W - 108] }
  )
  book.callout(
    "Start at the bottom of the stack",
    "Work upwards. If the engine is down, nothing above it can succeed, and reading " +
      "application logs will only produce noise. Establish that the host works before " +
      "investigating the pipeline.",
    "info"
  )
  book.h2("Reading the runner log")
  book.code(
    "tail -20 /tmp/runner.log\n\n# or, once installed as a service\njournalctl -u actions.runner.EbissaMideksa-asset-tracking -n 50 --no-pager",
    { caption: "runner activity" }
  )
  book.text(
    "Three lines matter. 'Connected to GitHub' proves outbound connectivity. 'Listening for " +
      "Jobs' proves the runner is registered and polling. 'Running job' proves a label match " +
      "occurred. If the third line never appears but the second does, the problem is labels " +
      "or repository access, not connectivity."
  )
  book.h2("Reading the worker diagnostic log")
  book.text(
    "Each job execution writes a detailed diagnostic log. This is where the per-step results " +
      "and process exit codes live, and it is how the failing step was identified during the " +
      "incident."
  )
  book.code(
    "cd ~/tracking/actions-runner\nW=$(ls -t _diag/Worker_*.log | head -1)\n\n# which steps ran, in order\ngrep -a 'Processing step: DisplayName' $W\n\n# per-step results\ngrep -aB6 '\"result\"' $W | grep -aE '\"stage\"|\"result\"'\n\n# any non-zero exit\ngrep -aE 'Finished process .* exit code [^0]' $W",
    { caption: "worker log analysis" }
  )
  book.callout(
    "All steps processed in the same second means an early failure",
    "When the step-processing lines all carry the same timestamp, the first substantive step " +
      "failed immediately and the rest were skipped. That signature points at configuration " +
      "rather than at the application.",
    "info"
  )
  book.callout(
    "Step logs are scrubbed after upload",
    "The detailed console output of each step is uploaded and then removed from the host. " +
      "Grepping the worker log for the error text often returns the script source rather " +
      "than the emitted message. When a diagnosis depends on the exact wording, read the " +
      "Annotations tab in the UI, which is authoritative.",
    "warn"
  )
  book.h2("Container level inspection")
  book.code(
    "# full picture including stopped containers - the -a is essential\ndocker ps -a --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}'\n\n# why did a container exit?\ndocker logs --tail 20 asset_tracking_nginx\n\n# what image is it actually running?\ndocker inspect <container> --format '{{.Config.Image}}'",
    { caption: "container inspection" }
  )
  book.callout(
    "docker ps without -a hides your failures",
    "A container that failed to start is not shown by the default command. During the " +
      "incident, the failing proxy was invisible until -a was added. Always use -a when " +
      "diagnosing a stack that is supposed to be running.",
    "danger"
  )
  book.h2("Establishing ground truth about the host")
  book.code(
    "uptime -p                      # has the host restarted recently?\nwho -b                        # when did it boot?\nls -la /var/run/docker.sock    # does the engine socket exist?\ndocker info --format '{{.ServerVersion}}'\nss -tlnp | grep -E ':80|:443' # is anything listening?\ncurl -sk --max-time 5 https://localhost/api/health",
    { caption: "the five-line host check" }
  )
  book.callout(
    "Check the boot time first",
    "If the host booted recently, the first hypothesis should be that anything started by " +
      "hand is gone. This single check explained the entire outage faster than any other.",
    "ok"
  )
  book.h2("Proving a hypothesis instead of assuming it")
  book.text(
    "During the incident a theory was formed that a fast failure proved a variable was unset. " +
      "It was tested by executing the relevant script under both conditions and timing each. " +
      "Both took the same time, so the theory was discarded and the conclusion was rebuilt on " +
      "elimination. That is the standard to aim for."
  )
  book.list([
    ["Prefer elimination to inference", "List every possible cause and exclude the ones you can check"],
    ["Test the theory, do not assert it", "If a cheap experiment settles it, run the experiment"],
    ["Say which is which", "Report what you observed separately from what you concluded"],
    ["Prefer the check that is one command", "Complex verification is verification that gets skipped"],
  ])
book.h1(SECTIONS[14])
  book.text(
    "This chapter is written to be used under pressure. Each tree starts from a symptom you " +
      "can see and ends with a specific command to run."
  )
  book.h2("Tree A: the job is Queued")
  book.code(
    "Status = Queued\n  |\n  +-- Q1. Is there a runner on the Runners page at all?\n  |     |\n  |     +-- No  -> register one (section 10). This is the whole fix.\n  |     +-- Yes -> Q2\n  |\n  +-- Q2. Does it show as Online / Idle?\n  |     |\n  |     +-- Offline -> host: systemctl is-active actions.runner.*\n  |     |              inactive -> sudo ./svc.sh install && sudo ./svc.sh start\n  |     |              failed    -> journalctl -u actions.runner.* -n 50\n  |     |\n  |     +-- Online -> Q3\n  |\n  +-- Q3. Does it carry every requested label?\n        |\n        +-- Missing a custom label -> re-register with --labels <name>\n        +-- All present -> Q4\n\n  Q4. Blocked behind an earlier run holding the concurrency group?\n        +-- Yes -> fix the blocking run first\n        +-- No  -> the runner may be busy with another job",
    { caption: "diagnosing a queued job" }
  )
  book.h2("Tree B: the job runs but fails early")
  book.code(
    "Job fails within seconds\n  |\n  +-- B1. Which step was last to run? (worker log, section 14)\n        |\n        +-- Preflight -> STACK_DIR empty?\n        |     -> stored as a Secret? move it to Variables (section 9)\n        |     -> right store? read the Annotations message verbatim\n        |\n        +-- Sync live checkout -> host has uncommitted changes\n        |     -> git status in the live checkout; commit or discard deliberately\n        |\n        +-- Checkout -> check repository access and workflow syntax\n\n  Job fails later, after the pull\n  |\n  +-- B2. Deploy step -> does docker info work? is the engine reachable?\n  |\n  +-- B3. Verify health -> the application genuinely failed to start\n        -> a real application problem now, not a pipeline problem",
    { caption: "diagnosing an early or late failure" }
  )
  book.h2("Tree C: production is unreachable")
  book.code(
    "Application unreachable\n  |\n  +-- C1. Is the engine running?\n  |     ls -la /var/run/docker.sock && docker info\n  |     No socket -> start Docker Desktop; if detached, re-enable WSL integration\n  |\n  +-- C2. Is anything listening on 80/443?\n  |     ss -tlnp | grep -E ':80|:443'\n  |     Nothing -> find the container that should publish them\n  |\n  +-- C3. Is that container running?\n  |     docker ps -a --filter name=nginx\n  |     Exited -> docker logs; exit 127 means a mounted script is not executable\n  |\n  +-- C4. Are other containers healthy?\n  |     -> if yes the fault is isolated to the proxy; start it directly\n  |\n  +-- C5. Did the host restart recently?\n        who -b -> if so, expect anything started by hand to be gone",
    { caption: "diagnosing an outage" }
  )
  book.h2("Tree D: the deploy never appears")
  book.code(
    "CI green, no Deploy run created\n  |\n  +-- D1. Was the commit on main?\n  +-- D2. Does the trigger's workflow name match ci.yml's `name:` exactly?\n  +-- D3. Did CI conclude success? A failed CI never triggers a deploy.\n  +-- D4. Is the deploy workflow present on the default branch?\n        (workflow_run runs the default branch version)",
    { caption: "diagnosing a missing trigger" }
  )
  book.callout(
    "Escalation heuristic",
    "If the symptom matches no tree here, stop treating it as a pipeline problem and check " +
      "the host from the outside. Most unrecoverable deploy debugging on this project has " +
      "turned out to be a host availability problem wearing a pipeline costume.",
    "info"
  )
book.h1(SECTIONS[15])
  book.text(
    "A deployment is not complete when the job goes green. It is complete when an external " +
      "client can reach the application and the application reports itself healthy."
  )
  book.h2("The verification stack")
  book.table(
    ["Layer", "Command", "Proves"],
    [
      ["Engine", "docker info", "The container engine is running"],
      ["Containers", "docker ps -a", "Every expected service exists and is running"],
      ["Ports", "ss -tlnp | grep 443", "The proxy is publishing"],
      ["Application", "make health", "The app answers and its dependencies are up"],
      ["Release", "cat .deploy/last-sha", "The intended commit is the one live"],
    ],
    { widths: [24, 52, CONTENT_W - 76] }
  )
  book.callout(
    "Verify from outside, always",
    "Every layer above can pass while the application is unreachable to a real user. Only " +
      "the last layer tests the thing that matters, and it must be exercised from the host's " +
      "network interface rather than from inside a container.",
    "ok"
  )
  book.h2("The expected health response")
  book.code(
    "{\n    \"status\": \"ok\",\n    \"checks\": {\n        \"db\": true,\n        \"redis\": true\n    },\n    \"timestamp\": \"2026-10-05T09:59:20.372Z\"\n}",
    { caption: "a healthy application" }
  )
  book.text(
    "The checks field is more informative than the status field. A non-ok status names the " +
      "failing dependency directly, which saves a round of log reading."
  )
  book.h2("Release state")
  book.code(
    "cat .deploy/active       # the slot currently taking traffic\ncat .deploy/last-sha     # the deployed commit\nmake deploy-status       # both, plus the rollback target",
    { caption: "what is live right now" }
  )
  book.callout(
    "Reconcile the deployed SHA with intent",
    "After every release compare .deploy/last-sha against the commit you meant to release. A " +
      "mismatch means an older artifact was deployed, which is worth investigating before the " +
      "next change compounds it.",
    "warn"
  )
  book.h2("Smoke checks worth automating")
  book.checklist("After each deploy", [
    ["Health endpoint returns ok", "With db and redis both true"],
    ["Deployed SHA matches intent", "cat .deploy/last-sha"],
    ["Active slot is the expected one", "cat .deploy/active"],
    ["Login page responds", "Catches proxy routing the health check misses"],
    ["Recent logs show no new errors", "docker logs --since 5m on the active slot"],
  ])
book.h1(SECTIONS[16])
  book.text(
    "Every fault in section 2 was survivable, but each one consumed time because the system " +
      "could not report the problem clearly. This chapter is the list of changes that would " +
      "have turned a multi-hour diagnosis into a one-line message."
  )
  book.h2("Fix 1: test the daemon, not the client binary")
  book.text(
    "The preflight step currently asks whether the docker client exists. That check passes " +
      "when the engine is dead, which is precisely when it matters most."
  )
  book.code(
    "# before - passes with a dead daemon\ncommand -v docker >/dev/null || { echo \"::error::docker not found\"; exit 1; }\n\n# after - fails loudly and names the real cause\ndocker info >/dev/null 2>&1 || {\n  echo \"::error::The container engine is not reachable.\"\n  echo \"::error::Production is down; start Docker Desktop and check WSL integration.\"\n  exit 1\n}",
    { caption: "hardening the preflight check" }
  )
  book.h2("Fix 2: fail loudly when the runner is offline")
  book.text(
    "No setting on a queued job can detect that no runner exists, because the job never " +
      "starts. The only reliable detector is a separate scheduled job that runs on hosted " +
      "runners and asserts that a self-hosted runner is online."
  )
  book.code(
    "on:\n  schedule:\n    - cron: '17 * * * *'   # hourly, deliberately off the hour\njobs:\n  runner-heartbeat:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Assert a deployment runner is online\n        env:\n          GH_TOKEN: ${{ secrets.RUNNER_TOKEN }}\n        run: |\n          ONLINE=$(gh api repos/${{ github.repository }}/actions/runners --jq \\\n            '.runners[] | select(.status==\"online\") | .name' | wc -l)\n          [ \"$ONLINE\" -gt 0 ] || { echo \"::error::No deployment runner is online\"; exit 1; }",
    { caption: "a heartbeat that catches a missing runner" }
  )
  book.callout(
    "This converts a silent indefinite stall into a red build",
    "The queued job will still wait, but you will now find out within the hour rather than the " +
      "next afternoon. The scheduled job runs on hosted runners precisely so that it can still " +
      "run when the self-hosted runner cannot.",
    "info"
  )
  book.h2("Fix 3: verify what the preflight assumes")
  book.table(
    ["Check to add", "Catches"],
    [
      ["docker info", "Engine down - the outage in this session"],
      ["Every mounted script is executable", "The proxy exit 127 failure"],
      ["Listener on 443 after rollout", "A proxy that fails after the switch"],
      ["Deployed SHA matches resolved SHA", "Deploying a stale artifact"],
    ],
    { widths: [62, CONTENT_W - 62] }
  )
  book.h2("Fix 4: keep permissions correct in git")
  book.text(
    "The executable bit was correct in the repository but wrong on the host, which means " +
      "nothing in version control would have caught it. A cheap CI check makes this class of " +
      "bug impossible to merge."
  )
  book.code(
    "# in ci.yml\n- name: Verify entrypoint script permissions\n  run: |\n    mode=$(git ls-files -s scripts/nginx-upstream.sh | cut -d' ' -f1)\n    [ \"$mode\" = \"100755\" ] || { echo \"::error::$mode - must be 100755\"; exit 1; }",
    { caption: "guarding the executable bit in CI" }
  )
  book.h2("Fix 5: make the environment durable")
  book.checklist("Preventing a repeat outage", [
    ["Docker Desktop starts with Windows", "Settings > General > start on sign in"],
    ["The runner is a systemd service", "svc.sh install and start, verified active"],
    ["The WSL integration is enabled", "Settings > Resources > WSL Integration"],
    ["systemd is enabled in WSL", "/etc/wsl.conf contains systemd=true"],
    ["A restart test is performed", "wsl --shutdown, then confirm the stack returns alone"],
  ])
  book.callout(
    "Test the restart, do not assume it",
    "Every durability setting above is a claim until it has survived a restart. Performing " +
      "one deliberate wsl --shutdown and confirming the stack returns unattended is the " +
      "cheapest possible insurance against a silent outage.",
    "ok"
)

  book.h2("Fix 6: make the pipeline observable")
book.h2("Fix 6: make the pipeline observable")
  book.text(
    "A pipeline you have to interrogate after the fact is a pipeline you cannot trust at " +
      "three in the morning. Three small additions make the state of the system legible " +
      "without any log reading."
  )
  book.list([
    ["Write a step summary on every run", "Which commit, which release, which outcome"],
    ["Echo the resolved configuration, redacted", "Which variables were non-empty, never their values"],
    ["Record the live slot and release SHA after rollout", "So the run page shows what is actually serving"],
  ])
  book.code(
    "- name: Summary\n  if: always()\n  run: |\n    {\n      echo \"### Deploy\"\n      echo \"\"\n      echo \"- commit:  \\`${{ github.sha }}\\`\"\n      echo \"- release: \\`${{ steps.sha.outputs.sha }}\\`\"\n      echo \"- status:  ${{ job.status }}\"\n    } >> \"$GITHUB_STEP_SUMMARY\"\n\n- name: Record live state\n  if: always()\n  working-directory: ${{ vars.STACK_DIR }}\n  run: |\n    echo \"- active slot: $(cat .deploy/active 2>/dev/null || echo unknown)\" >> \"$GITHUB_STEP_SUMMARY\"\n    echo \"- live sha:    $(cat .deploy/last-sha 2>/dev/null || echo none)\"      >> \"$GITHUB_STEP_SUMMARY\"",
    { caption: "observability additions to the deploy job" }
  )
  book.callout(
    "if: always() is what makes this useful",
    "A step that only runs on success tells you nothing about failures, which is exactly when " +
      "you are reading it. Always run the summary, and make its status field explicit.",
    "info"
  )
  book.h2("Fix 7: alert on a stale release")
  book.text(
    "Even with every check above, a deploy can fail silently if nobody opens the Actions tab. " +
      "A scheduled assertion that the live release matches the latest successful CI run " +
      "converts that silence into a notification."
  )
  book.code(
    "- name: Assert production is current\n  run: |\n    LIVE=$(cat \"$STACK_DIR/.deploy/last-sha\")\n    EXPECTED=$(gh api repos/${{ github.repository }}/actions/runs/\\\n      --jq '[.workflow_runs[] | select(.name==\"CI\" and .conclusion==\"success\")] | .[0].head_sha[0:7]')\n    [ -n \"$EXPECTED\" ] || { echo \"no successful CI run found\"; exit 0; }\n    [ \"$LIVE\" = \"$EXPECTED\" ] || {\n      echo \"::error::Production is on $LIVE but CI is green on $EXPECTED\"\n      exit 1\n    }",
    { caption: "a scheduled staleness check" }
  )
  book.callout(
    "This catches the case nothing else does",
    "Every other failure mode here produces a red build. A deploy that simply never happened " +
      "produces silence. This check closes that last gap.",
    "ok"
  )
  book.h2("Prioritising the changes")
  book.table(
    ["Priority", "Change", "Why it comes first"],
    [
      ["1", "Runner as a service", "Stops the outage class that took production down"],
      ["2", "docker info in preflight", "Names the real outage instead of the symptom"],
      ["3", "Docker Desktop auto-start", "Prevents the reboot-triggered outage entirely"],
      ["4", "Scheduled runner heartbeat", "Turns an indefinite stall into a red build"],
      ["5", "Executable bit check in CI", "Prevents the proxy exit 127 class"],
      ["6", "Step summary with live state", "Makes the run page answer most questions"],
      ["7", "Staleness check", "Catches the silent no-deploy case"],
    ],
    { widths: [20, 56, CONTENT_W - 76] }
  )
  book.callout(
    "Do items 1 to 3 before anything else",
    "They address the only failure in this session that took production offline. The rest " +
      "improve diagnosis speed, which matters far less than availability.",
    "danger"
  )
book.h1(SECTIONS[17])
  book.text(
    "Auto-deploy removes a class of routine work but adds a class of new work: watching a " +
      "system that changes itself. This chapter covers the routines that replace the old " +
      "manual release habit."
  )
  book.h2("The daily loop")
  book.checklist("Daily, 5 minutes", [
    ["Confirm the last release is the intended one", "cat .deploy/last-sha"],
    ["Confirm the application is healthy", "make health"],
    ["Skim the monitoring stack", "Grafana dashboards on localhost:3001"],
    ["Check for failed workflows", "Actions tab: any red run in the last 24 hours"],
  ])
  book.checklist("Weekly, 30 minutes", [
    ["Review the Actions tab for intermittent failures", "Particularly runner and pull issues"],
    ["Verify the offsite backup is present and restorable", "Do not just check that it exists"],
    ["Check disk usage on the Docker data volume", "Images accumulate with every release"],
    ["Review pending dependency updates", "Batch them; do not auto-merge to main"],
  ])
  book.checklist("Monthly", [
    ["Review registry package visibility and access", "Confirm no stale token retains access"],
    ["Rotate the registry token if nearing expiry", "Before it expires, not after"],
    ["Test a rollback on a non-critical release", "Prove the rollback path still works"],
    ["Review the failure catalog in section 13", "Add anything new that was encountered"],
  ])
  book.h2("Releasing")
  book.text(
    "The release procedure is deliberately short. There is no manual deploy command, and its " +
      "absence is intentional."
  )
  book.code(
    "# release: merge to main, that's it\ngit checkout main && git pull\ngit merge --no-ff <feature-branch>\ngit push origin main\n\n# CI runs, then Deploy runs automatically.\n# Watch it. Do not also run anything by hand.",
    { caption: "the whole release procedure" }
  )
  book.callout(
    "Never bypass CI to release faster",
    "The absence of a manual deploy is what guarantees that production only ever runs code " +
      "that passed CI. Reaching for a manual deploy 'just this once' is how a pipeline stops " +
      "being trustworthy.",
    "danger"
  )
  book.h2("Redeploying and rolling back")
  book.code(
    "# redeploy a release that already passed CI\nActions tab > Deploy > Run workflow > sha: b7250cb\n\n# rollback, decided by a human\nmake deploy-status     # see the rollback target first\nmake rollback          # switch back to the warm slot\nmake health            # confirm it is serving again",
    { caption: "redeploy and rollback" }
  )
  book.callout(
    "Decide before you act",
    "Read deploy-status first. Rollback is occasionally the wrong answer, most obviously when " +
      "the fault is in the database schema rather than the code, in which case rolling the " +
      "code back does not undo the migration.",
    "warn"
  )
  book.h2("Housekeeping")
  book.code(
    "docker image ls            # what is on disk\nmake clean-images          # drop old release tags, keep live and rollback\ndocker system df             # disk reclaimed by pruning",
    { caption: "image housekeeping" }
  )
book.h1(SECTIONS[18])
  book.text(
    "This chapter is a template for handling a production incident on this project, written " +
      "so it can be followed while under pressure."
  )
  book.h2("First five minutes")
  book.checklist("Triage", [
    ["Is the application reachable?", "curl -sk --max-time 5 https://localhost/api/health"],
    ["Is the container engine running?", "docker info"],
    ["Did the host restart?", "who -b"],
    ["Is the runner online?", "systemctl is-active actions.runner.*"],
    ["Is a deploy in flight or stuck?", "Actions tab, and the runner log on the host"],
  ])
  book.callout(
    "Declare the severity out loud",
    "If the application is unreachable, that is a production incident regardless of what the " +
      "pipeline is doing. Pipeline work is secondary to restoring service.",
    "danger"
  )
  book.h2("Restoring service, in order of speed")
  book.table(
    ["Option", "Time to restore", "Use when"],
    [
      ["Start the failed proxy container", "Seconds", "Image and configuration are correct"],
      ["Re-enable WSL integration, restart engine", "Minutes", "The socket is missing"],
      ["Rollback to the previous release", "Under a minute", "The new release is the problem"],
      ["Redeploy the last good SHA", "About a minute", "The artifact is wrong, not the code"],
      ["Full stack down with no recent change", "Minutes", "Investigate the host itself"],
    ],
    { widths: [56, 26, CONTENT_W - 82] }
  )
  book.h2("Communicating")
  book.list([
    ["State the impact", "Who is affected, and how, in plain terms"],
    ["State what you know", "Observed facts, with the commands that demonstrate them"],
    ["State what you are doing next", "One concrete action, not a list of possibilities"],
    ["Record timestamps", "For every state change on the host"],
  ])
  book.h2("After the incident")
  book.checklist("Close-out", [
    ["Confirm the application is healthy", "make health, from outside"],
    ["Confirm the deployed release is known good", "cat .deploy/last-sha"],
    ["Confirm the runner is a service", "systemctl is-enabled actions.runner.*"],
    ["Write the entry in section 13 if it is new", "The next occurrence should be faster"],
    ["Apply the relevant fix from section 17", "Turn the incident into an improvement"],
  ])
  book.callout(
    "The measure of a good incident is what does not happen next time",
    "Every fault in section 2 was recoverable. The lasting improvement is not the fix, it is " +
      "the check that would have detected the problem automatically. Prefer adding a check " +
      "over re-explaining the failure in the next handover.",
    "ok"
  )
book.h1(SECTIONS[19])
  book.text(
    "A single-page reference for use during an incident. If you read only one page of this " +
      "document, read this one."
  )
  book.h2("The sixty-second host check")
  book.code(
    "cd /home/ebissamideksa/tracking\n\ndocker info --format '{{.ServerVersion}}' || echo 'ENGINE DOWN'\nsystemctl is-active actions.runner.* 2>/dev/null || echo 'RUNNER INACTIVE'\nss -tlnp | grep -E ':80|:443' || echo 'NOTHING ON 80/443'\nmake health 2>&1 | tail -5\ncat .deploy/last-sha",
    { caption: "run this first, every time" }
  )
  book.h2("Diagnosis by symptom")
  book.table(
    ["Symptom", "Most likely cause", "First command"],
    [
      ["Deploy Queued forever", "No runner", "systemctl is-active actions.runner.*"],
      ["Fails in under a second", "Empty variable", "Read the Annotations tab"],
      ["Fails at pull, denied", "Engine down or token scope", "docker info"],
      ["No traffic, containers healthy", "Proxy exited", "docker ps -a --filter name=nginx"],
      ["Nothing runs after restart", "Started by hand", "who -b"],
      ["No Deploy run at all", "Trigger name mismatch", "Compare name fields"],
    ],
    { widths: [46, 44, CONTENT_W - 90], fontSize: 7.8, headSize: 8 }
  )
  book.h2("Command reference")
  book.table(
    ["Command", "Purpose"],
    [
      ["make health", "Check the application health endpoint"],
      ["make deploy-status", "Show the live release and the rollback target"],
      ["make login", "Authenticate to the container registry"],
      ["make pull", "Pull the app and migrator images for the current commit"],
      ["make rollback", "Return to the previous release"],
      ["make up / make start", "Bring the stack up / start existing containers"],
      ["make logs s=<service>", "Tail logs for one service"],
      ["make clean-images", "Drop old release tags, keep live and rollback"],
      ["sudo ./svc.sh install", "Install the runner as a systemd service"],
      ["sudo ./svc.sh start", "Start the runner service"],
    ],
    { widths: [52, CONTENT_W - 52] }
  )
  book.h2("Configuration inventory")
  book.table(
    ["Name", "Store", "Purpose"],
    [
      ["STACK_DIR", "Variables", "Absolute path to the live checkout"],
      ["DEPLOY_RUNNER_LABELS", "Variables", "Optional JSON label override"],
      ["GHCR_USERNAME", "Secrets", "Registry account name"],
      ["GHCR_TOKEN", "Secrets", "Token with package read permission"],
    ],
    { widths: [48, 26, CONTENT_W - 74] }
  )
  book.h2("Glossary")
  book.table(
    ["Term", "Meaning"],
    [
      ["Artifact", "The built output a pipeline produces; here, a container image"],
      ["Blue/green", "Two parallel slots with traffic switched between them"],
      ["Digest", "An immutable content hash identifying one exact image"],
      ["Entrypoint", "The first program a container runs; its failures stop the container"],
      ["GHCR", "GitHub Container Registry, where images are published"],
      ["Label", "A tag a runner carries that a job selects on"],
      ["Live checkout", "The persistent host copy of the repo that is actually deployed"],
      ["Pull request", "A proposed change; CI verifies it, and it never publishes"],
      ["Runner", "The agent that executes a job"],
      ["Self-hosted runner", "A runner on infrastructure you operate"],
      ["Slot", "One half of the blue/green pair, blue or green"],
      ["Workflow", "One automated process defined by a YAML file"],
      ["workflow_run", "A trigger that fires when another workflow finishes"],
    ],
    { widths: [38, CONTENT_W - 38] }
  )
  book.h2("Closing note")
  book.text(
    "The pipeline described here is small by design: one build workflow, one deploy " +
      "workflow, one runner, one registry, one host. Every idea in this document applies " +
      "unchanged to a much larger system, and every fault in section 2 is one that " +
      "reproduces at any scale. The habit that matters is not memorising commands. It is " +
      "establishing ground truth before forming a theory, and preferring a check that " +
      "fails loudly over one that passes quietly."
  )
  book.callout(
    "Start every investigation from the outside in",
    "Engine, then containers, then ports, then the application. A deploy pipeline reports " +
      "the failure it hits, which is rarely the failure that matters. Only checking the host " +
      "directly tells you the truth.",
    "ok"
  )
}

// ---- two-pass driver -----------------------------------------------------

function build(tocEntries) {
  const book = new Book({ title: TITLE, subject: "Reading material" })
  render(book, tocEntries)
  return book
}

// Pass 1: no page numbers, just to learn where each section lands.
const first = build(null)
const marks = first.marks

// Pass 2: rebuild with real page numbers.
const entries = SECTIONS.map((s) => [s, marks.get(s) ?? null])
const book = build(entries)

const total = book.finish({ footer: "Asset Tracking - CI/CD and Auto-Deploy Guide" })
const bytes = book.save(OUT)

const ok = total >= MIN_PAGES
console.log(`wrote ${OUT}`)
console.log(`  pages: ${total} (minimum ${MIN_PAGES}) ${ok ? "OK" : "UNDER MINIMUM"}`)
console.log(`  size:  ${(bytes / 1024).toFixed(1)} KB`)
for (const [label, page] of entries) {
  console.log(`  p${String(page ?? "?").padStart(3)}  ${label}`)
}
if (!ok) process.exitCode = 1