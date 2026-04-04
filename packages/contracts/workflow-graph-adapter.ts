/**
 * Typed adapter contract between normalized workflow graph objects and React Flow UI.
 *
 * Ownership rules:
 * - The backend owns the normalized WorkflowGraph (source of truth for persistence).
 * - The frontend owns React Flow Node[] / Edge[] derived from the normalized graph.
 * - React Flow JSON is NEVER persisted as the product source of truth.
 * - Conversion is unidirectional for load (backend -> frontend) and validated for save (frontend -> backend).
 *
 * Stack assumptions:
 * - Frontend: React + @xyflow/react (official React Flow package)
 * - Backend: Python FastAPI (Pydantic models mirror these shapes)
 * - Communication: REST JSON over HTTP
 */

// ──────────────────────────────────────────────
// 1. Backend-normalized workflow graph (source of truth)
// ──────────────────────────────────────────────

/**
 * Unique identifier for a workflow node in the normalized graph.
 * Backend-generated, stable across edits.
 */
export type WorkflowNodeId = string;

/**
 * Unique identifier for a workflow edge in the normalized graph.
 * Backend-generated, stable across edits.
 */
export type WorkflowEdgeId = string;

/**
 * Unique identifier for a workflow definition.
 */
export type WorkflowId = string;

/**
 * Semantic category of a workflow step.
 * Matches the thin four-step chain: input -> transform -> execute -> result.
 */
export type WorkflowStepKind =
  | "input"
  | "transform"
  | "execute"
  | "result";

/**
 * A single node in the normalized workflow graph.
 * Backend-authoritative; contains only domain semantics, no layout data.
 */
export interface WorkflowNode {
  id: WorkflowNodeId;
  kind: WorkflowStepKind;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Machine-readable operation identifier (e.g. "molecule.load", "dft.optimize"). */
  operation: string;
  /** Keyed map of input slot definitions. Keys are stable slot names. */
  inputs: Record<string, WorkflowInputSlot>;
  /** Keyed map of output slot definitions. Keys are stable slot names. */
  outputs: Record<string, WorkflowOutputSlot>;
  /** Default parameter values for this operation. Merged with user overrides at runtime. */
  defaults: Record<string, unknown>;
  /** Validation rules applied to this node's configuration before submission. */
  validation?: NodeValidationRule[];
  /** Backend metadata (created_at, version, etc). Omitted in client-facing payloads. */
  metadata?: Record<string, unknown>;
}

export interface WorkflowInputSlot {
  /** Display name for the input slot. */
  label: string;
  /** Expected data type (e.g. "molecule", "number", "string", "file"). */
  type: string;
  /** Whether this input is required. */
  required: boolean;
  /** Default value if not provided by an upstream edge or user input. */
  defaultValue?: unknown;
  /** Human-readable description of what this input expects. */
  description?: string;
}

export interface WorkflowOutputSlot {
  /** Display name for the output slot. */
  label: string;
  /** Data type produced by this slot. */
  type: string;
  /** Human-readable description of what this output contains. */
  description?: string;
}

export interface NodeValidationRule {
  /** Rule identifier (e.g. "required_inputs", "valid_molecule_format"). */
  rule: string;
  /** Human-readable error message shown when validation fails. */
  message: string;
  /** Severity: "error" blocks submission, "warning" is advisory. */
  severity: "error" | "warning";
}

/**
 * A directed edge in the normalized workflow graph.
 * Connects an output slot of a source node to an input slot of a target node.
 */
export interface WorkflowEdge {
  id: WorkflowEdgeId;
  /** ID of the source (upstream) node. */
  sourceNodeId: WorkflowNodeId;
  /** Name of the output slot on the source node. */
  sourceSlot: string;
  /** ID of the target (downstream) node. */
  targetNodeId: WorkflowNodeId;
  /** Name of the input slot on the target node. */
  targetSlot: string;
}

/**
 * The complete normalized workflow graph as persisted by the backend.
 * This is the source of truth. Layout, viewport, and UI state are NOT included.
 */
export interface WorkflowGraph {
  /** Workflow definition identifier. */
  id: WorkflowId;
  /** Human-readable name. */
  name: string;
  /** Optional description shown in the UI. */
  description?: string;
  /** Version string for optimistic concurrency. */
  version: string;
  /** All nodes in the workflow. */
  nodes: WorkflowNode[];
  /** All directed edges connecting nodes. */
  edges: WorkflowEdge[];
  /** Ordered list of node IDs representing the canonical execution sequence. */
  executionOrder: WorkflowNodeId[];
  /** Timestamp of last modification (ISO 8601). */
  updatedAt: string;
}

// ──────────────────────────────────────────────
// 2. React Flow adapter types (frontend-internal)
// ──────────────────────────────────────────────

import type { Node, Edge } from "@xyflow/react";

/**
 * Custom data attached to every React Flow node that represents a workflow step.
 * This bridges the normalized WorkflowNode to React Flow's Node<Data> generic.
 */
export interface WorkflowNodeData {
  /** Reference back to the normalized node ID. */
  workflowNodeId: WorkflowNodeId;
  kind: WorkflowStepKind;
  operation: string;
  /** Current user-facing parameter values (may differ from defaults). */
  params: Record<string, unknown>;
  /** Validation state computed client-side before save. */
  validationErrors: string[];
  /** Whether this node is currently selected for editing. */
  isSelected?: boolean;
  /** Run-time status when viewing a completed workflow run. */
  runStatus?: "pending" | "running" | "success" | "error" | "skipped";
  /** Error message if runStatus is "error". */
  runError?: string;
}

/**
 * React Flow node type for workflow steps.
 * The `type` string maps to a registered custom node component.
 */
export type WorkflowFlowNode = Node<WorkflowNodeData, string>;

/**
 * Custom data attached to React Flow edges.
 */
export interface WorkflowEdgeData {
  /** Reference back to the normalized edge ID. */
  workflowEdgeId: WorkflowEdgeId;
  sourceSlot: string;
  targetSlot: string;
}

/**
 * React Flow edge type for workflow connections.
 */
export type WorkflowFlowEdge = Edge<WorkflowEdgeData>;

// ──────────────────────────────────────────────
// 3. Adapter conversion functions (contract signatures)
// ──────────────────────────────────────────────

/**
 * Converts a backend-normalized WorkflowGraph into React Flow Node[] and Edge[].
 * Layout positions are assigned by an auto-layout algorithm; the graph itself
 * carries no positional data.
 *
 * @param graph - The normalized workflow graph from the backend.
 * @returns { nodes, edges } - React Flow-compatible arrays.
 */
export function graphToFlow(
  graph: WorkflowGraph
): { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] };

/**
 * Converts React Flow Node[] and Edge[] back into a normalized WorkflowGraph
 * suitable for persistence.
 *
 * Validates that:
 * - All referenced workflow node/edge IDs exist in the original graph.
 * - No new nodes or edges were introduced (React Flow is not the source of truth).
 * - All required inputs are satisfied either by upstream edges or explicit values.
 *
 * @param flowNodes - Current React Flow nodes.
 * @param flowEdges - Current React Flow edges.
 * @param baseGraph - The original normalized graph (for validation).
 * @returns The normalized WorkflowGraph ready for save, or throws on validation failure.
 */
export function flowToGraph(
  flowNodes: WorkflowFlowNode[],
  flowEdges: WorkflowFlowEdge[],
  baseGraph: WorkflowGraph
): WorkflowGraph;

// ──────────────────────────────────────────────
// 4. API payload shapes (REST contract)
// ──────────────────────────────────────────────

/**
 * GET /api/workflows/:id
 *
 * Response: the full normalized WorkflowGraph.
 */
export interface GetWorkflowResponse {
  graph: WorkflowGraph;
}

/**
 * POST /api/workflows
 *
 * Request body for creating a new workflow.
 * The backend assigns `id`, `version`, and `updatedAt`.
 */
export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  /** Optional seed: a template identifier or partial graph to start from. */
  templateId?: string;
}

/**
 * Response for workflow creation.
 */
export interface CreateWorkflowResponse {
  graph: WorkflowGraph;
}

/**
 * PUT /api/workflows/:id
 *
 * Request body for updating an existing workflow.
 * Uses optimistic concurrency via `expectedVersion`.
 */
export interface UpdateWorkflowRequest {
  /** Version string from the graph being updated. Rejects if stale. */
  expectedVersion: string;
  graph: Omit<WorkflowGraph, "id" | "version" | "updatedAt">;
}

/**
 * Response for workflow update.
 */
export interface UpdateWorkflowResponse {
  graph: WorkflowGraph;
}

/**
 * POST /api/workflows/:id/validate
 *
 * Request: send the current graph (or partial changes) for server-side validation.
 * Response: list of validation errors/warnings.
 */
export interface ValidateWorkflowRequest {
  graph: Omit<WorkflowGraph, "id" | "version" | "updatedAt">;
}

export interface ValidationIssue {
  /** Node or edge ID the issue relates to, or null for graph-level issues. */
  targetId: WorkflowNodeId | WorkflowEdgeId | null;
  /** Machine-readable issue code. */
  code: string;
  /** Human-readable message. */
  message: string;
  severity: "error" | "warning";
}

export interface ValidateWorkflowResponse {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * POST /api/workflows/:id/run
 *
 * Request: execute the workflow with optional parameter overrides.
 */
export interface RunWorkflowRequest {
  /**
   * Optional per-node parameter overrides.
   * Keys are WorkflowNodeId, values are partial param maps.
   */
  paramOverrides?: Record<WorkflowNodeId, Record<string, unknown>>;
}

export interface RunWorkflowResponse {
  /** Server-assigned run identifier. */
  runId: string;
  /** Initial status. */
  status: "queued" | "running";
}

/**
 * GET /api/workflows/:id/runs/:runId
 *
 * Response: run state with per-node results for the visualizer.
 */
export interface GetRunResponse {
  runId: string;
  workflowId: WorkflowId;
  status: "queued" | "running" | "success" | "error" | "cancelled";
  /** Per-node execution results keyed by WorkflowNodeId. */
  nodeResults: Record<WorkflowNodeId, NodeRunResult>;
  /** ISO 8601 timestamp when the run started. */
  startedAt: string;
  /** ISO 8601 timestamp when the run completed, or null if still running. */
  completedAt: string | null;
  /** Top-level error message if the run failed. */
  error?: string;
}

export interface NodeRunResult {
  status: "pending" | "running" | "success" | "error" | "skipped";
  /** Output artifacts produced by this node (keyed by output slot name). */
  outputs?: Record<string, RunArtifact>;
  /** Error details if status is "error". */
  error?: string;
  /** ISO 8601 timestamp when this node started executing. */
  startedAt?: string;
  /** ISO 8601 timestamp when this node completed. */
  completedAt?: string;
}

export interface RunArtifact {
  /** Artifact type (e.g. "molecule", "image", "text", "json"). */
  type: string;
  /** URL to fetch the artifact content. */
  url: string;
  /** Optional inline preview for small artifacts. */
  preview?: string;
  /** Human-readable label. */
  label?: string;
}

// ──────────────────────────────────────────────
// 5. Error envelope (all API errors)
// ──────────────────────────────────────────────

export interface ApiError {
  /** Machine-readable error code. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Per-field validation errors, if applicable. */
  details?: Record<string, string[]>;
}

// ──────────────────────────────────────────────
// 6. Integration risk notes
// ──────────────────────────────────────────────
//
// RISK-1: Optimistic concurrency
//   The `version` field on WorkflowGraph must be checked on every PUT.
//   If two users edit the same workflow simultaneously, the second save
//   must return 409 Conflict with a clear error so the UI can prompt
//   a reload-and-merge flow.
//
// RISK-2: Node/edge identity
//   WorkflowNodeId and WorkflowEdgeId are backend-assigned and stable.
//   The frontend MUST NOT generate new IDs. New nodes are created by
//   POSTing a "add node" request that returns the assigned ID.
//   Draft-mode (unsaved) nodes may use client-side temporary IDs
//   prefixed with "draft:" which are resolved on save.
//
// RISK-3: Validation asymmetry
//   Client-side validation is for UX feedback only. The backend
//   re-validates on every save and run. Discrepancies must favor
//   the backend's judgment.
//
// RISK-4: Run state polling vs. streaming
//   The GetRunResponse supports polling. For long-running workflows,
//   consider Server-Sent Events or WebSocket for real-time node status
//   updates. This contract supports both patterns via the same shape.
//
// RISK-5: Artifact size
//   RunArtifact.preview is for small inline previews only (< 64KB).
//   Full artifacts must be fetched via the artifact URL to avoid
//   bloating the run-state payload.
//
// RISK-6: Execution order
//   The `executionOrder` field is backend-computed (topological sort).
//   The frontend displays it but must not modify it directly. Changes
//   to edges trigger re-computation on the backend.
