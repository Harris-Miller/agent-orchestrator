# Working with an agent

## The transcript

An agent's output streams into the session as it works. Tool calls, file edits and interim messages are grouped into a collapsible **work region** between your message and the turn's answer. It starts collapsed and, while the turn is running, previews the latest step — so the answer stays readable and the work behind it is one click away.

## Permissions and questions

Agents ask before they act. Two kinds of requests wait on a session until you answer them:

- **Permission requests** (`session/request_permission`) — e.g. "run `pnpm test`?" Choose one of the options the agent offers.
- **Elicitations** (`elicitation/create`) — a small form the agent needs filled in. Accept, decline, or cancel.

HOA can send an OS notification when an agent needs you, with an optional sound, and optionally only when the window is not focused.

## Sending while the agent is working

You do not have to wait for a turn to end.

- **Steer** injects your message into the turn that is running. The agent sees it immediately and the message joins the same turn, labelled _Steering_. Steering is offered only when the agent supports it and no permission or question is pending.
- **Queue** holds one message and sends it as a new turn when the current one ends. Queue again and the messages are merged. Cancelling the turn returns the queued message to your draft.

Which one the **Send** button does is a setting (`midTurnSend`: steer or queue); the other is one click away.

## Session settings

Agents report their own **config options** — a model or mode picker, or on/off toggles. HOA shows whatever the agent reports and remembers each agent's choices so the pickers are filled in before the agent finishes starting. You can hide models you never use and reorder the rest in Settings.

## Usage

When the agent reports it, the session shows how full the context window is and the session's cumulative cost.
