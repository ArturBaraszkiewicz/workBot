---
project: workBot
version: 1
status: draft
created: 2026-07-31
context_type: brownfield
product_type: "web-app + api"
target_scale:
  users: medium
  qps: null
  data_volume: null
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

## Current System Overview

The current system is a working reference implementation of a Google Chat work-time bot used internally by dozens of employees, including developers, testers, PMs, and HR staff. Employees use it to start and stop work, record breaks and office presence, check their own status, and see who is working today by team or role. HR also uses its polling capabilities and reads poll results.

The reference implementation is a bundled Node.js and Express application. Team membership is hardcoded in the application, while daily work reports and polls are stored in JSON files. The old application will not be evolved directly; it exists to show how the current workflow and commands behave.

Historical data does not need to be migrated. The familiar command structure, including commands such as `/start` and `/who`, must be preserved so employees can continue recording time without leaving the company chat application.

## Problem Statement & Motivation

The application will be rewritten from scratch as two connected product surfaces: an internal company-chat bot API and an administration panel. User, team, work-time, presence, leave, poll, announcement, and reporting information must no longer be managed through hardcoded structures or local files; the new system must make this information manageable through persistent application records.

HR needs to manage the team, publish polls and announcements, review poll results, and inspect work, office-presence, and leave statistics. PMs need to know who is working today. The current workaround requires direct edits to the prototype's hardcoded team lists and data files, which does not provide a manageable administrative workflow or reliable access to the required statistics.

The rewrite was deferred because it requires replacing the bot, adding management capabilities, and leaving room for possible future integrations. Work can now proceed within a three-week after-hours delivery budget.

## User & Persona

### Primary persona

HR staff manage employees and teams, create polls and announcements, review poll results, and inspect who worked, attended the office, or was on leave over a selected period. They reach for the administration panel when maintaining team information or answering operational questions about attendance and work activity.

### Secondary personas

PMs need a current view of who is working today so they can coordinate their teams. Employees, including developers, testers, PMs, and HR staff, use the internal company chat to record work time and check who is working without leaving the chat application.

## Success Criteria

### Primary

- HR can create two teams, add employees, assign them to those teams, and publish a welcome announcement.
- After an employee uses `/start`, the bot confirms that work has started and includes the announcement configured by HR.
- After a PM uses `/who`, the bot shows all members of that PM's team who are currently working.
- HR can publish a poll, employees can vote through the bot, and HR can review the results.

### Secondary

- No additional secondary outcome was selected for the MVP.

### Guardrails

- Work-time calculation must remain correct across the supported work-day flow.
- Bot responses must remain compatible with the expected company-chat response format.
- Familiar command names and interaction patterns, including `/start` and `/who`, must be preserved.

## User Stories

### US-01: A configured team uses the bot

- **Given** HR has created teams, assigned employees and PMs to them, and published a welcome announcement
- **When** an employee uses `/start` and a PM subsequently uses `/who`
- **Then** the employee receives confirmation with the HR announcement, and the PM sees currently working members of the PM's own team
- **Before this change** team membership is hardcoded and HR cannot manage the announcement through an administration panel

#### Acceptance Criteria

- `/start` records the employee's work start and returns a company-chat-compatible response.
- The response to `/start` includes the active announcement configured by HR.
- `/who` returns currently working employees from the requesting PM's team.
- Work-time calculations remain correct after the new start event is recorded.

### US-02: Employees participate in an HR poll

- **Given** HR has published an active poll
- **When** an employee views and answers the poll through the internal company chat
- **Then** the vote is recorded and HR can review the poll results
- **Before this change** poll data is maintained outside an administration panel

#### Acceptance Criteria

- An employee can submit an answer using the bot's familiar poll interaction.
- HR can view aggregated results in the administration panel.

## Scope of Change

- [new] FR-001: HR/Admin can add and deactivate employee accounts and assign employees to teams while preserving historical records. Priority: must-have
  > Socrates: Counter-argument considered: removing an account could destroy its work-time history. Resolution: revised; accounts are deactivated and their history remains available.
- [new] FR-002: HR/Admin can create and manage teams, and can remove a team only after all members have been reassigned or unassigned. Priority: must-have
  > Socrates: Counter-argument considered: deleting a populated team could orphan its members. Resolution: revised; the team must be emptied before removal.
- [new] FR-003: HR/Admin can publish announcements, with the latest announcement shown by the bot to employees. Priority: must-have
  > Socrates: Counter-argument considered: showing an announcement on every `/start` could become repetitive. Resolution: kept; the bot always shows the latest announcement.
- [new] FR-004: HR/Admin can create polls and review their results. Priority: must-have
  > Socrates: Counter-argument considered: polls could distract the MVP from its core work-time purpose. Resolution: promoted from nice-to-have to must-have.
- [preserved] FR-005: Employee can vote in an active poll through the bot and can replace a previous vote with a later answer. Priority: must-have
  > Socrates: Counter-argument considered: repeated voting could produce duplicate or ambiguous results. Resolution: revised; the employee's latest answer replaces the previous answer.
- [new] FR-006: HR/Admin can view statistics for work time, office presence, and manually recorded leave. Priority: must-have
  > Socrates: Counter-argument considered: leave statistics would be misleading without an agreed source. Resolution: kept; HR records leave manually through the panel, captured separately in FR-010.
- [new] FR-007: PM can view read-only statistics for teams assigned to that PM by HR. Priority: must-have
  > Socrates: Counter-argument considered: team-scoped access is unreliable without explicit PM ownership. Resolution: revised; HR assigns PMs to one or more teams.
- [preserved] FR-008: Employee can record the work-day flow, including retroactive times without change history, through familiar company-chat commands. Priority: must-have
  > Socrates: Counter-argument considered: retroactive entries without an audit trail can reduce report trustworthiness. Resolution: kept; retroactive entry remains allowed without a change history.
- [preserved] FR-009: Employee can use `/who` to see currently working employees across the company. Priority: must-have
  > Socrates: Counter-argument considered: company-wide presence visibility may disclose more than a team member needs. Resolution: kept; all employees may see the whole company.
- [new] FR-010: HR/Admin can manually record employee leave for reporting and availability views. Priority: must-have
  > Socrates: Counter-argument considered: manually entered leave can conflict with an existing work-time entry. Resolution: revised; the system flags the conflict and requires HR to decide.

## Constraints & Compatibility

- The internal company chat is the only external product integration included in the MVP. Integration with an issue-tracking system remains a possible future change, not part of this delivery.
- Existing command names and familiar interaction patterns, including `/start` and `/who`, must remain available.
- Bot responses must continue to conform to the response format expected by the internal company chat.
- Work-time calculation is critical preserved behavior and must not regress during the rewrite.
- Historical prototype records do not need to be imported; the new system may begin with new persistent records.
- Existing employee workflows must remain available while team, account, poll, announcement, leave, and reporting management moves to the administration panel.

### Non-Functional Requirements

- A user receives a bot response within 5 seconds of submitting a supported company-chat command under normal operating conditions.
- A typical administration-panel view presents its usable content within 5 seconds under normal operating conditions.
- Current work presence may be visible company-wide, but detailed work-time, office-presence, and leave history is visible only to HR/Admin and PMs assigned to the relevant team.
- The administration panel remains usable on the latest two major versions of the two company-standard desktop browsers.
- All administration-panel functionality is operable using a keyboard.

## Business Logic Changes

workBot calculates work time from the start to the end of work, subtracts breaks, and determines the employee's current status from that employee's commands.

The rule consumes work-day commands submitted by an employee through the internal company chat and produces the employee's current work status and calculated work time. HR-managed team assignments determine which historical team statistics a PM may inspect, while current company-wide presence remains visible through `/who`.

The latest HR announcement is returned after `/start`. An employee's latest poll vote replaces the employee's previous vote. When manually entered leave conflicts with recorded work time, the conflict remains unresolved until HR decides which record should apply.

## Access Control Changes

Employees access the bot through the internal company chat and do not authenticate separately. The bot uses the employee's existing chat identity to associate commands with the corresponding employee.

Panel users sign in with their company identity account through SSO. Public registration is not available; an existing administrator provisions panel accounts and assigns access.

- **HR/Admin:** full access to employee, team, work-time, presence, leave, poll, announcement, and reporting management.
- **PM:** read-only access to statistics for the PM's own assigned teams.
- **Employee:** bot access through the internal company chat; no administration-panel access by default.

## Non-Goals

- **No import of historical prototype records.** The new system starts with new persistent records because preserving the prototype's history is not required.
- **No issue-tracker integration in the MVP.** Such integration remains a possible future change and must not expand the current three-week delivery scope.

## Open Questions

No open questions were identified during shaping.
