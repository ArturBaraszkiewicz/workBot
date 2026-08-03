---
project: workBot
context_type: brownfield
created: 2026-07-30
updated: 2026-07-31
product_type: "web-app + api"
target_scale:
  users: medium
  qps: null
  data_volume: null
timeline_budget:
  delivery_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: context type
      decision: brownfield
    - topic: change category
      decision: rewrite the bot API from scratch, add an admin panel, move data management from hardcoded files to a database, and allow for future integrations
    - topic: primary persona
      decision: HR is primary; PM and employee are secondary
    - topic: preserved behavior
      decision: existing Google Chat command structure such as /start and /who must remain familiar; historical data does not need to be migrated
    - topic: why now
      decision: the prototype needs a full rewrite and preparation for possible future integrations such as Jira; the work waited for available resources
    - topic: bot authentication
      decision: employees use their existing identity from the internal Google Chat and do not log in separately to the bot
    - topic: admin panel authentication
      decision: panel users sign in with a company Google account through SSO; there is no public registration and accounts are provisioned by an existing administrator
    - topic: panel roles
      decision: HR/Admin has full management access, PM has read-only access to statistics for their team, and employees use the bot without panel access
    - topic: MVP scope and timeline
      decision: deliver the fuller MVP scope in three weeks rather than reducing it to only the reference flow
    - topic: primary success flow
      decision: HR creates teams, assigns employees, and publishes a welcome announcement; an employee starts work through the bot and receives the announcement; a PM uses /who to see currently working members of their team
    - topic: secondary success outcome
      decision: HR can create polls and employees can vote through the bot
    - topic: MVP guardrails
      decision: work-time calculation and Google Chat response format must not regress
    - topic: Socrates review for FR-001 through FR-009
      decision: preserve history by deactivating accounts; require teams to be emptied before deletion; always show the latest announcement; make polls required; allow vote replacement; enter leave manually; let HR assign PMs to teams; allow retroactive time input without change history; keep company-wide /who visibility
    - topic: Socrates review for FR-010
      decision: if manually entered leave conflicts with recorded work time, the system flags the conflict and requires HR to decide
    - topic: secondary success criterion after poll promotion
      decision: no additional secondary criterion
    - topic: MVP integrations
      decision: Google Chat is the only external integration in the MVP; Jira remains a possible future integration
    - topic: response timing
      decision: bot responses and typical administration-panel views are delivered within five seconds
    - topic: data visibility
      decision: current presence is visible company-wide; detailed history is limited to HR and the PM assigned to the relevant team
    - topic: admin panel compatibility
      decision: support the latest two major versions of Chrome and Edge and make the panel operable by keyboard
    - topic: product surface
      decision: the rewritten product combines a Google Chat bot API with a web administration panel
    - topic: target users
      decision: the product remains internal to one company and serves dozens to approximately one hundred people
    - topic: delivery timing
      decision: three weeks of after-hours work with no hard deadline
    - topic: existing operational constraints
      decision: no additional deployment, endpoint, downtime, CI/CD, or monitoring constraints were identified
    - topic: explicit MVP non-goals
      decision: do not migrate historical JSON data and do not integrate with Jira in the MVP
  frs_drafted: 10
  quality_check_status: accepted
---

## Current System Overview

The current system is a working reference implementation of a Google Chat work-time bot. Employees use it to start and stop work, record breaks and office presence, check their own status, and see who is working today by team or role. HR also uses its polling capabilities and reads poll results.

The reference implementation is a bundled Node.js and Express application. Team membership is hardcoded in the application, while daily work reports and polls are stored in JSON files. The old application will not be evolved directly; it exists to show how the current workflow and commands behave.

Historical data does not need to be migrated. The familiar Google Chat command structure, including commands such as `/start` and `/who`, must be preserved so employees can continue recording time without leaving the chat application.

## Problem Statement & Motivation

The application will be rewritten from scratch as two connected surfaces: a Google Chat bot API and an administration panel. User, team, work-time, presence, leave, poll, announcement, and reporting data must no longer be managed through hardcoded structures or JSON files; the new system must make this information manageable through persistent application data.

HR needs to manage the team, publish polls and announcements, review poll results, and inspect work, office-presence, and leave statistics. PMs need to know who is working today. The rewrite was deferred because it requires replacing the bot, adding management capabilities, and leaving room for possible future integrations such as Jira.

## User & Persona

### Primary persona

HR staff manage employees and teams, create polls and announcements, review poll results, and inspect who worked, attended the office, or was on leave over a selected period. They reach for the administration panel when maintaining team information or answering operational questions about attendance and work activity.

### Secondary personas

PMs need a current view of who is working today so they can coordinate their teams. Employees, including developers, testers, PMs, and HR staff, use Google Chat to record work time and check who is working without leaving the chat application.

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
- Bot responses must remain compatible with the expected Google Chat response format.
- Familiar command names and interaction patterns, including `/start` and `/who`, must be preserved.

## User Stories

### US-01: A configured team uses the bot

- **Given** HR has created teams, assigned employees and PMs to them, and published a welcome announcement
- **When** an employee uses `/start` and a PM subsequently uses `/who`
- **Then** the employee receives confirmation with the HR announcement, and the PM sees currently working members of the PM's own team

#### Acceptance Criteria

- `/start` records the employee's work start and returns a Google Chat-compatible response.
- The response to `/start` includes the active announcement configured by HR.
- `/who` returns currently working employees from the requesting PM's team.
- Work-time calculations remain correct after the new start event is recorded.

### US-02: Employees participate in an HR poll

- **Given** HR has published an active poll
- **When** an employee views and answers the poll through Google Chat
- **Then** the vote is recorded and HR can review the poll results

#### Acceptance Criteria

- An employee can submit an answer using the bot's familiar poll interaction.
- HR can view aggregated results in the administration panel.

## Scope of Change

- FR-001: HR/Admin can add and deactivate employee accounts and assign employees to teams while preserving historical records. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: removing an account could destroy its work-time history. Resolution: revised; accounts are deactivated and their history remains available.
- FR-002: HR/Admin can create and manage teams, and can remove a team only after all members have been reassigned or unassigned. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: deleting a populated team could orphan its members. Resolution: revised; the team must be emptied before removal.
- FR-003: HR/Admin can publish announcements, with the latest announcement shown by the bot to employees. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: showing an announcement on every `/start` could become repetitive. Resolution: kept; the bot always shows the latest announcement.
- FR-004: HR/Admin can create polls and review their results. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: polls could distract the MVP from its core work-time purpose. Resolution: promoted from nice-to-have to must-have.
- FR-005: Employee can vote in an active poll through the bot and can replace a previous vote with a later answer. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: repeated voting could produce duplicate or ambiguous results. Resolution: revised; the employee's latest answer replaces the previous answer.
- FR-006: HR/Admin can view statistics for work time, office presence, and manually recorded leave. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: leave statistics would be misleading without an agreed source. Resolution: kept; HR records leave manually through the panel, captured separately in FR-010.
- FR-007: PM can view read-only statistics for teams assigned to that PM by HR. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: team-scoped access is unreliable without explicit PM ownership. Resolution: revised; HR assigns PMs to one or more teams.
- FR-008: Employee can record the work-day flow, including retroactive times without change history, through familiar Google Chat commands. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: retroactive entries without an audit trail can reduce report trustworthiness. Resolution: kept; retroactive entry remains allowed without a change history.
- FR-009: Employee can use `/who` to see currently working employees across the company. Priority: must-have. Change: preserved
  > Socrates: Counter-argument considered: company-wide presence visibility may disclose more than a team member needs. Resolution: kept; all employees may see the whole company.
- FR-010: HR/Admin can manually record employee leave for reporting and availability views. Priority: must-have. Change: new
  > Socrates: Counter-argument considered: manually entered leave can conflict with an existing work-time entry. Resolution: revised; the system flags the conflict and requires HR to decide.

## Constraints & Compatibility

- Google Chat is the only external integration included in the MVP. Jira is a possible future integration, not part of this delivery.
- Existing command names and familiar interaction patterns, including `/start` and `/who`, must remain available.
- Bot responses must continue to conform to the response format expected by Google Chat.
- Work-time calculation is critical preserved behavior and must not regress during the rewrite.
- Historical JSON data does not need to be migrated; the new system may begin with new persistent records.
- Existing employee workflows must remain available while team, account, poll, announcement, leave, and reporting management moves to the new administration panel and persistent data store.

### Non-Functional Requirements

- A user receives a bot response within 5 seconds of submitting a supported Google Chat command under normal operating conditions.
- A typical administration-panel view presents its usable content within 5 seconds under normal operating conditions.
- Current work presence may be visible company-wide, but detailed work-time, office-presence, and leave history is visible only to HR/Admin and PMs assigned to the relevant team.
- The administration panel remains usable on the latest two major versions of Chrome and Edge.
- All administration-panel functionality is operable using a keyboard.

## Business Logic Changes

workBot calculates work time from the start to the end of work, subtracts breaks, and determines the employee's current status from that employee's commands.

The rule consumes work-day commands submitted by an employee through Google Chat and produces the employee's current work status and calculated work time. HR-managed team assignments determine which historical team statistics a PM may inspect, while current company-wide presence remains visible through `/who`.

The latest HR announcement is returned after `/start`. An employee's latest poll vote replaces the employee's previous vote. When manually entered leave conflicts with recorded work time, the conflict remains unresolved until HR decides which record should apply.

## Access Control Changes

Employees access the bot through the internal Google Chat and do not authenticate separately. The bot uses the employee's existing chat identity to associate commands with the corresponding employee.

Panel users sign in with their company Google account through SSO. Public registration is not available; an existing administrator provisions panel accounts and assigns access.

- **HR/Admin:** full access to employee, team, work-time, presence, leave, poll, announcement, and reporting management.
- **PM:** read-only access to statistics for the PM's own team.
- **Employee:** bot access through Google Chat; no administration-panel access by default.

## Non-Goals

- **No migration of historical JSON data.** The new system starts with new persistent records because preserving the prototype's historical data is not required.
- **No Jira integration in the MVP.** Jira remains a possible future integration and must not expand the current three-week delivery scope.

## Open Questions

No open questions were identified during shaping.

## Forward: technical-roadmap

- Keep future integration with systems such as Jira possible after the MVP; no Jira integration is included in the current product scope.

## Quality cross-check

- Access Control: present.
- Business Logic: present as a one-sentence domain rule.
- Project artifacts: present with a valid checkpoint.
- Timeline-cost acknowledgment: present through the three-week delivery budget.
- Non-Goals: present.
- Preserved behavior: present through explicit Google Chat command, response-format, and work-time calculation constraints.
- Gaps accepted by override: none.
