import { registerTool } from "./registry";
import {
  createSchedule,
  listSchedules,
  removeSchedule,
  setScheduleEnabled,
} from "../schedule-db";

registerTool({
  spec: {
    type: "function",
    function: {
      name: "add_schedule",
      description:
        "Create a recurring scheduled task. The server will run the prompt automatically on the specified interval or cron schedule. Examples: 'every 3m', 'every 1h', '*/5 * * * *'.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The prompt to run on each scheduled tick",
          },
          schedule: {
            type: "string",
            description: "Schedule expression: 'every 3m', 'every 1h', or cron like '*/5 * * * *'",
          },
        },
        required: ["prompt", "schedule"],
      },
    },
  },
  async execute(args) {
    try {
      const created = createSchedule(String(args.prompt), String(args.schedule));
      return `Schedule #${created.id} created. Next run: ${created.next_run}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
});

registerTool({
  spec: {
    type: "function",
    function: {
      name: "list_schedules",
      description: "List all scheduled tasks with their status, next run time, and last result.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  async execute() {
    const schedules = listSchedules();
    if (!schedules.length) return "No schedules configured.";
    return schedules
      .map((s) => {
        const status = s.enabled ? "enabled" : "paused";
        const last = s.last_error
          ? `last error: ${s.last_error}`
          : s.last_result
            ? `last result: ${s.last_result.slice(0, 200)}`
            : "not yet run";
        return `#${s.id} [${status}] "${s.prompt.slice(0, 80)}" | ${s.schedule_expr} | next: ${s.next_run} | ${last}`;
      })
      .join("\n");
  },
});

registerTool({
  spec: {
    type: "function",
    function: {
      name: "delete_schedule",
      description: "Delete a scheduled task by its ID.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The schedule ID to delete",
          },
        },
        required: ["id"],
      },
    },
  },
  async execute(args) {
    const removed = removeSchedule(Number(args.id));
    return removed ? `Schedule #${args.id} deleted.` : `Schedule #${args.id} not found.`;
  },
});

registerTool({
  spec: {
    type: "function",
    function: {
      name: "pause_schedule",
      description: "Pause a scheduled task so it stops running. Can be resumed later.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The schedule ID to pause",
          },
        },
        required: ["id"],
      },
    },
  },
  async execute(args) {
    const updated = setScheduleEnabled(Number(args.id), false);
    return updated ? `Schedule #${args.id} paused.` : `Schedule #${args.id} not found.`;
  },
});

registerTool({
  spec: {
    type: "function",
    function: {
      name: "resume_schedule",
      description: "Resume a paused scheduled task so it starts running again.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "number",
            description: "The schedule ID to resume",
          },
        },
        required: ["id"],
      },
    },
  },
  async execute(args) {
    const updated = setScheduleEnabled(Number(args.id), true);
    return updated ? `Schedule #${args.id} resumed.` : `Schedule #${args.id} not found.`;
  },
});
