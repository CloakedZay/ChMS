import type { SupabaseClient } from "@supabase/supabase-js";

// A person's discipleship journey, for the assistant ("what's my next
// module?"). Same rules as the member Discipleship page
// (member-dashboard/discipleship/page.js) — keep the two in step:
//   * modules: the general path plus the modules of the person's ministries
//   * a module is complete when every question has an approved answer
//   * each group (general path, each ministry) has its own order; a module
//     unlocks when the previous one in its group is complete
// Everything is read as the signed-in person, so they only see their own
// answers.

export type ModuleStatus = {
  id: number;
  title: string;
  description: string | null;
  number: number;            // position within its group, from 1
  questions: number;
  approved: number;
  pending: number;
  rejected: number;
  complete: boolean;
  unlocked: boolean;
};

export type Group = { label: string; ministryId: string | null; modules: ModuleStatus[] };

type ModRow = { id: number; title: string; description: string | null; order_index: number | null; ministry_id: string | null };

export async function loadJourney(db: SupabaseClient, userId: string): Promise<Group[]> {
  const [mods, qs, prog, assigned, mins, me] = await Promise.all([
    db.from("discipleship_modules").select("id, title, description, order_index, ministry_id").eq("is_active", true),
    db.from("discipleship_questions").select("id, module_id"),
    db.from("discipleship_progress").select("question_id, status").eq("member_id", userId),
    db.from("ministry_assignments").select("ministry_id, member_id"),
    db.from("ministries").select("id, name").eq("is_active", true),
    db.from("members").select("id").eq("profile_id", userId),
  ]);

  // Members only see their own assignments; staff see their branch's, so
  // narrow those to the person's own member record when it can be read.
  const myMemberIds = new Set((me.data || []).map((m: { id: number }) => m.id));
  const myMinistryIds = new Set(
    (assigned.data || [])
      .filter((a: { member_id: number }) => !myMemberIds.size || myMemberIds.has(a.member_id))
      .map((a: { ministry_id: string }) => a.ministry_id)
  );

  const status = new Map<number, string>();
  for (const p of (prog.data || []) as { question_id: number; status: string }[]) status.set(p.question_id, p.status);
  const questionsOf = new Map<number, number[]>();
  for (const q of (qs.data || []) as { id: number; module_id: number }[]) {
    questionsOf.set(q.module_id, [...(questionsOf.get(q.module_id) || []), q.id]);
  }

  const byOrder = (a: ModRow, b: ModRow) => (a.order_index || 0) - (b.order_index || 0);
  const visible = ((mods.data || []) as ModRow[]).filter((m) => !m.ministry_id || myMinistryIds.has(m.ministry_id));

  const build = (label: string, ministryId: string | null): Group => {
    const list = visible.filter((m) => (m.ministry_id || null) === ministryId).sort(byOrder);
    const out: ModuleStatus[] = [];
    list.forEach((m, i) => {
      const ids = questionsOf.get(m.id) || [];
      const sts = ids.map((id) => status.get(id));
      const approved = sts.filter((s) => s === "approved").length;
      const complete = ids.length > 0 && approved === ids.length;
      out.push({
        id: m.id,
        title: m.title,
        description: m.description,
        number: i + 1,
        questions: ids.length,
        approved,
        pending: sts.filter((s) => s === "pending").length,
        rejected: sts.filter((s) => s === "rejected").length,
        complete,
        unlocked: i === 0 || out[i - 1].complete,
      });
    });
    return { label, ministryId, modules: out };
  };

  const groups = [build("Discipleship path", null)];
  const ministries = ((mins.data || []) as { id: string; name: string }[])
    .filter((mi) => myMinistryIds.has(mi.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const mi of ministries) groups.push(build(`${mi.name} modules`, mi.id));
  return groups.filter((g) => g.modules.length > 0);
}

// "2 of 3 answers approved, 1 under review" etc.
function moduleState(m: ModuleStatus, tl: boolean): string {
  if (m.complete) return tl ? "tapos na" : "complete";
  if (!m.unlocked) return tl ? "naka-lock pa" : "locked until the one before it is complete";
  if (m.questions === 0) return tl ? "wala pang tanong" : "no questions yet";
  const parts: string[] = [];
  if (m.approved) parts.push(tl ? `${m.approved} sa ${m.questions} sagot ang approved` : `${m.approved} of ${m.questions} answers approved`);
  if (m.pending) parts.push(tl ? `${m.pending} ang nire-review pa` : `${m.pending} under review`);
  if (m.rejected) parts.push(tl ? `${m.rejected} ang kailangang ayusin` : `${m.rejected} need${m.rejected === 1 ? "s" : ""} revision`);
  if (!parts.length) return tl ? "hindi pa nasisimulan" : "not started yet";
  return parts.join(", ");
}

export function describeProgress(groups: Group[], tl: boolean): string {
  const all = groups.flatMap((g) => g.modules);
  if (!all.length) {
    return tl
      ? "Wala pang discipleship module para sa inyo. Magdadagdag po ang inyong pastor."
      : "There are no discipleship modules for you yet. Your pastor will add them soon.";
  }
  const done = all.filter((m) => m.complete).length;
  const lines: string[] = [
    tl ? `Natapos na ninyo ang ${done} sa ${all.length} na module.` : `You've completed ${done} of ${all.length} modules.`,
  ];
  for (const g of groups) {
    const next = g.modules.find((m) => !m.complete);
    const left = g.modules.filter((m) => !m.complete).length;
    if (!next) {
      lines.push(tl ? `${g.label}: tapos na lahat! 🎉` : `${g.label}: all done! 🎉`);
      continue;
    }
    lines.push(tl
      ? `${g.label}: susunod ang Module ${next.number} – “${next.title}” (${moduleState(next, tl)}). ${left} pa ang natitira.`
      : `${g.label}: next is Module ${next.number} – “${next.title}” (${moduleState(next, tl)}). ${left} left.`);
  }
  const revise = all.filter((m) => m.rejected > 0 && !m.complete);
  if (revise.length) {
    lines.push(tl
      ? `May sagot na kailangang ayusin sa: ${revise.map((m) => `“${m.title}”`).join(", ")}.`
      : `Answers to revise in: ${revise.map((m) => `“${m.title}”`).join(", ")}.`);
  }
  lines.push(tl ? "Buksan ang Discipleship para magpatuloy." : "Open Discipleship to continue.");
  return lines.join("\n");
}

// Progress asked from inside one module ("Ask about this lesson"): where the
// person stands in THIS module, and what opens next.
export function describeLessonProgress(groups: Group[], moduleId: number, tl: boolean): string | null {
  const group = groups.find((g) => g.modules.some((m) => m.id === moduleId));
  if (!group) return null;
  const m = group.modules.find((x) => x.id === moduleId)!;
  const next = group.modules.find((x) => x.number === m.number + 1);
  const nextName = next ? `Module ${next.number} – “${next.title}”` : null;

  if (m.complete) {
    return tl
      ? `Tapos na ninyo ang “${m.title}”! 🎉 ${nextName ? `Ang susunod ay ${nextName}.` : `Ito ang huling module sa ${group.label}.`}`
      : `You've completed “${m.title}”! 🎉 ${nextName ? `Next is ${nextName}.` : `This is the last module in ${group.label}.`}`;
  }
  if (!m.unlocked) {
    return tl
      ? `Naka-lock pa ang “${m.title}”. Magbubukas ito kapag natapos ang module bago nito.`
      : `“${m.title}” is still locked. It opens when you finish the module before it.`;
  }
  const answered = m.approved + m.pending + m.rejected;
  const lines = [
    tl
      ? `Ito ang Module ${m.number} – “${m.title}”. Kalagayan: ${moduleState(m, tl)}${m.questions ? ` (${answered} sa ${m.questions} tanong ang nasagot na)` : ""}.`
      : `You're on Module ${m.number} – “${m.title}”. Status: ${moduleState(m, tl)}${m.questions ? ` (${answered} of ${m.questions} questions answered)` : ""}.`,
  ];
  if (m.rejected) {
    lines.push(tl ? "Ayusin ang mga sagot na may “Needs Revision” at i-submit muli." : "Fix the answers marked “Needs Revision” and submit them again.");
  } else if (answered < m.questions) {
    lines.push(tl ? "Sagutin ang mga tanong sa itaas at pindutin ang Submit Answers." : "Answer the questions above and press Submit Answers.");
  } else if (m.pending) {
    lines.push(tl ? "Hinihintay na lang ang review ng inyong pastor o leader." : "Your answers are waiting for your pastor or leader to review them.");
  }
  if (nextName) {
    lines.push(tl
      ? `Kapag na-approve lahat ng sagot, magbubukas ang ${nextName}.`
      : `When all your answers are approved, ${nextName} unlocks.`);
  }
  return lines.join("\n");
}

// "What is module 3 about?" — numbered within the general path, or within a
// ministry's modules when the question names that ministry.
export function findModule(groups: Group[], number: number, question: string): { group: Group; module: ModuleStatus } | null {
  const q = question.toLowerCase();
  // "youth module 1" → the Youth Ministry's module 1 (name with or without "ministry")
  const named = groups.find((g) => {
    if (!g.ministryId) return false;
    const name = g.label.replace(/ modules$/, "").toLowerCase();
    return q.includes(name) || q.includes(name.replace(/\s*ministry$/, ""));
  });
  const group = named || groups.find((g) => !g.ministryId) || groups[0];
  const found = group?.modules.find((m) => m.number === number);
  return group && found ? { group, module: found } : null;
}

export function describeModule(group: Group, m: ModuleStatus, tl: boolean): string {
  const head = `Module ${m.number} – “${m.title}” (${group.label})`;
  const about = m.description?.trim() || (tl ? "Wala pang paglalarawan ang module na ito." : "This module has no description yet.");
  const qs = m.questions ? (tl ? `${m.questions} tanong` : `${m.questions} question${m.questions === 1 ? "" : "s"}`) : "";
  return `${head}\n${about}\n\n${tl ? "Kalagayan" : "Your status"}: ${moduleState(m, tl)}${qs ? ` · ${qs}` : ""}.`;
}
