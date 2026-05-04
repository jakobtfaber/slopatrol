export type IsoTimestamp = string;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CodingAgent =
  | "claude-code"
  | "codex-cli"
  | "pi"
  | "opencode"
  | "copilot-cli"
  | (string & {});

export type ListenerInfo = {
  name: string;
  version?: string;
};

export type EventSourceMetadata = {
  agent_event_name?: string;
  agent_schema_version?: string;
  raw?: JsonValue;
};

export type NormalEventBase = {
  event_id: string;
  observed_at: IsoTimestamp;
  listener: ListenerInfo;
  source?: EventSourceMetadata;
  user_id?: never;
};

export type RootSessionEvent = NormalEventBase & {
  kind: "session";
  session_id: string;
  coding_agent: CodingAgent;
  cwd: string;
  parent_session_id?: never;
  spawned_by_turn_id?: never;
};

export type SubagentSessionEvent = NormalEventBase & {
  kind: "session";
  session_id: string;
  coding_agent: CodingAgent;
  cwd: string;
  parent_session_id: string;
  spawned_by_turn_id: string;
};

export type SessionEvent = RootSessionEvent | SubagentSessionEvent;

export type TurnEvent = NormalEventBase & {
  kind: "turn";
  session_id: string;
  turn_id: string;
  parent_turn_ids: string[];
  user_prompt?: string;
  started_at?: IsoTimestamp;
  ended_at?: IsoTimestamp;
};

export type ModelRequestEvent = NormalEventBase & {
  kind: "model_request";
  session_id: string;
  turn_id: string;
  model_request_id: string;
  provider: string;
  model: string;
  started_at?: IsoTimestamp;
  ended_at?: IsoTimestamp;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
};

export type ToolEvent = NormalEventBase & {
  kind: "tool";
  session_id: string;
  turn_id: string;
  tool_event_id: string;
  tool_name: string;
  phase: "start" | "end";
  input?: JsonValue;
  output?: JsonValue;
  error?: string;
};

// NormalEvent avoids colliding with the global DOM Event type.
export type NormalEvent =
  | SessionEvent
  | TurnEvent
  | ModelRequestEvent
  | ToolEvent;

export type EventInput<T extends NormalEvent> = Omit<T, "kind">;
export type SessionEventInput =
  | Omit<RootSessionEvent, "kind">
  | Omit<SubagentSessionEvent, "kind">;

export type EventsRequest = {
  url: string;
  init: {
    method: "POST";
    headers: {
      authorization: string;
      "content-type": "application/json";
    };
    body: string;
  };
};

export type CreateEventsRequestInput = {
  serverUrl: string;
  bearerToken: string;
  events: NormalEvent[];
};

export const sessionEvent = (event: SessionEventInput): SessionEvent => ({
  ...event,
  kind: "session",
});

export const turnEvent = (event: EventInput<TurnEvent>): TurnEvent => ({
  ...event,
  kind: "turn",
});

export const modelRequestEvent = (
  event: EventInput<ModelRequestEvent>,
): ModelRequestEvent => ({
  ...event,
  kind: "model_request",
});

export const toolEvent = (event: EventInput<ToolEvent>): ToolEvent => ({
  ...event,
  kind: "tool",
});

export const isNormalEvent = (value: unknown): value is NormalEvent => {
  if (!isObject(value) || hasReservedUserId(value) || !hasBaseFields(value)) {
    return false;
  }

  switch (value.kind) {
    case "session":
      return (
        isString(value.session_id) &&
        isString(value.coding_agent) &&
        isString(value.cwd) &&
        isOptionalString(value.parent_session_id) &&
        isOptionalString(value.spawned_by_turn_id) &&
        hasSubagentRelationshipPair(value)
      );
    case "turn":
      return (
        isString(value.session_id) &&
        isString(value.turn_id) &&
        Array.isArray(value.parent_turn_ids) &&
        value.parent_turn_ids.every(isString) &&
        isOptionalString(value.user_prompt) &&
        isOptionalIsoTimestamp(value.started_at) &&
        isOptionalIsoTimestamp(value.ended_at)
      );
    case "model_request":
      return (
        isString(value.session_id) &&
        isString(value.turn_id) &&
        isString(value.model_request_id) &&
        isString(value.provider) &&
        isString(value.model) &&
        isOptionalIsoTimestamp(value.started_at) &&
        isOptionalIsoTimestamp(value.ended_at) &&
        isOptionalNonNegativeNumber(value.input_tokens) &&
        isOptionalNonNegativeNumber(value.output_tokens) &&
        isOptionalNonNegativeNumber(value.cost_usd)
      );
    case "tool":
      return (
        isString(value.session_id) &&
        isString(value.turn_id) &&
        isString(value.tool_event_id) &&
        isString(value.tool_name) &&
        (value.phase === "start" || value.phase === "end") &&
        isOptionalJsonValue(value.input) &&
        isOptionalJsonValue(value.output) &&
        isOptionalString(value.error)
      );
    default:
      return false;
  }
};

export const assertNormalEvent = (value: unknown): NormalEvent => {
  if (!isNormalEvent(value)) {
    throw new Error("invalid NormalEvent");
  }

  return value;
};

export const createEventsRequest = ({
  serverUrl,
  bearerToken,
  events,
}: CreateEventsRequestInput): EventsRequest => {
  if (serverUrl.trim() === "") {
    throw new Error("serverUrl is required");
  }

  if (bearerToken.trim() === "") {
    throw new Error("bearerToken is required");
  }

  for (const event of events) {
    assertNormalEvent(event);
  }

  return {
    url: serverUrl,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ events }),
    },
  };
};

export const sendEvents = async (events: NormalEvent[]): Promise<void> => {
  for (const event of events) {
    assertNormalEvent(event);
  }

  throw new Error("not implemented");
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isString = (value: unknown): value is string => typeof value === "string";

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || isString(value);

const isOptionalNonNegativeNumber = (
  value: unknown,
): value is number | undefined =>
  value === undefined ||
  (typeof value === "number" && Number.isFinite(value) && value >= 0);

const isOptionalJsonValue = (value: unknown): value is JsonValue | undefined =>
  value === undefined || isJsonValue(value);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (isPlainObject(value)) {
    return Object.values(value).every(isJsonValue);
  }

  return false;
};

const hasSubagentRelationshipPair = (value: Record<string, unknown>): boolean =>
  (value.parent_session_id === undefined) ===
  (value.spawned_by_turn_id === undefined);

const hasReservedUserId = (value: Record<string, unknown>): boolean =>
  value.user_id !== undefined;

const hasBaseFields = (value: Record<string, unknown>): boolean =>
  isString(value.event_id) &&
  isIsoTimestamp(value.observed_at) &&
  isObject(value.listener) &&
  isString(value.listener.name) &&
  isOptionalString(value.listener.version) &&
  isOptionalEventSourceMetadata(value.source);

const isOptionalEventSourceMetadata = (
  value: unknown,
): value is EventSourceMetadata | undefined => {
  if (value === undefined) {
    return true;
  }

  return (
    isObject(value) &&
    isOptionalString(value.agent_event_name) &&
    isOptionalString(value.agent_schema_version) &&
    isOptionalJsonValue(value.raw)
  );
};

const isOptionalIsoTimestamp = (
  value: unknown,
): value is IsoTimestamp | undefined =>
  value === undefined || isIsoTimestamp(value);

const isIsoTimestamp = (value: unknown): value is IsoTimestamp =>
  isString(value) && Number.isFinite(Date.parse(value));

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
