export type CommandFamily = "start" | "stop" | "break-start" | "break-end" | "office" | "status" | "who";

export type ResponseSchema = "text" | "legacy-card";

export type ContractOutcome = "accepted" | "rejected";

export interface SyntheticUser {
  id: string;
  displayName: string;
  team: string;
  role: string;
}

export interface BotCommand {
  alias: `/${string}`;
  arguments: readonly string[];
}

export interface ContractCommand extends BotCommand {
  family: CommandFamily;
}

export interface WorkBreak {
  startedAt: string;
  endedAt?: string;
}

export interface WorkdayState {
  userId: string;
  isWorking: boolean;
  isOnBreak: boolean;
  isOffice: boolean;
  startedAt?: string;
  endedAt?: string;
  breaks: readonly WorkBreak[];
}

export interface ContractStepExpectation {
  outcome: ContractOutcome;
  responseSchema: ResponseSchema;
  states: readonly WorkdayState[];
  workedMinutes?: Readonly<Record<string, number>>;
  visibleUserIds?: readonly string[];
}

export interface ContractStep {
  id: string;
  now: string;
  actorId: string;
  command: ContractCommand;
  activeAnnouncement?: string;
  expected: ContractStepExpectation;
  note?: string;
}

export interface BehaviorFixture {
  id: string;
  description: string;
  users: readonly SyntheticUser[];
  initialStates: readonly WorkdayState[];
  steps: readonly ContractStep[];
}

export interface BotCommandRequest {
  actorId: string;
  command: BotCommand;
  activeAnnouncement?: string;
}

export interface BotCommandResult {
  outcome: ContractOutcome;
  response: unknown;
  states: readonly WorkdayState[];
  workedMinutes?: Readonly<Record<string, number>>;
  visibleUserIds?: readonly string[];
}

export interface ContractClock {
  now(): Date;
  set(now: Date): void;
}

export interface BotContractAdapter {
  execute(request: BotCommandRequest): BotCommandResult | Promise<BotCommandResult>;
}

export interface BotContractAdapterContext {
  users: readonly SyntheticUser[];
  initialStates: readonly WorkdayState[];
  clock: ContractClock;
}

export type BotContractAdapterFactory = (
  context: BotContractAdapterContext,
) => BotContractAdapter | Promise<BotContractAdapter>;

export interface PrototypeDeviation {
  id: string;
  classification: "prd-override" | "extension-seam" | "prototype-defect" | "accepted-legacy";
  prototypeBehavior: string;
  contractBehavior: string;
  rationale: string;
}
