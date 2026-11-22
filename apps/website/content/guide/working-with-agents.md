# Working with an agent

## Watching the agent work

An agent's output streams into the session as it works. The steps behind each answer — files read, edits made, commands run — are folded into a collapsible section between your message and the agent's answer. It starts collapsed and, while the agent is working, previews the latest step, so the answer stays readable and the work is one click away.

## Permissions and questions

Agents ask before they act. Two kinds of requests wait on a session until you answer:

- **Permission requests** — e.g. "run `pnpm test`?" Pick one of the options the agent offers, such as allow once or reject.
- **Questions** — a small form the agent needs filled in. Answer it, decline, or cancel.

Turn on notifications in Settings to hear about these when you're not looking — with an optional sound, and optionally only when HOA isn't the focused window.

## Sending while the agent is working

You don't have to wait for a turn to end.

- **Steer** sends your message into the turn that's running. The agent sees it right away, and it shows in the transcript labelled _Steering_. Steering is offered when the agent supports it and nothing is waiting for your answer.
- **Queue** holds one message and sends it as soon as the current turn ends. Queue again and the messages are combined. Cancelling the turn puts the queued message back in your draft.

Choose in Settings which of the two the **Send** button does; the other is always one click away.

## Session settings

Each agent offers its own settings for a session — usually a model and a mode, sometimes on/off options. HOA shows whatever the agent offers and remembers the choices, so they're ready before the agent has finished starting. In Settings you can hide models you never use and reorder the rest.

## Usage

When the agent reports it, the session shows how full its context window is and what the session has cost so far.
