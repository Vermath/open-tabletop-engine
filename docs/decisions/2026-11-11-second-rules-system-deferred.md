# A second rules system is deferred

Date: 2026-11-11
Status: deferred

## Decision

Do not start a second bundled rules system yet. The engine keeps one first-class system for now.

## Why

A second system is the proof that the system SDK is general, but it is also the largest single piece of work on the roadmap, and it competes with table-stakes work (rendering, voice and video, importers) that every table needs regardless of system.

## What this does not block

- The system SDK and its documentation stay supported; a third party can still build a system.
- Work that keeps rules out of the core (typed commands, system-owned sheets and actions) continues.

## Revisit when

The board renderer and the voice and video embed have shipped, or a contributor offers to own a system.
