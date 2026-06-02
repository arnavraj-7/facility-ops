/**
 * Seed a demo tenant ("Zordon's Command Center") with users across every role
 * and a spread of tickets (varied priority/status, some overdue) so the
 * dashboard and board look alive on first run.
 *
 *   npm run seed
 *
 * Safe to re-run: it wipes and recreates the demo tenant only.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { connectDB } from '../lib/db.js';
import Tenant from '../models/Tenant.js';
import User from '../models/User.js';
import Ticket from '../models/Ticket.js';
import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';
import Counter from '../models/Counter.js';
import { computeSlaDueAt } from '../lib/sla.js';
import { heuristicRoute } from '../services/aiClient.js';

const DEMO_SLUG = 'command-center';
const PASSWORD = 'Password123';

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

const run = async () => {
  await connectDB();
  const hash = await bcrypt.hash(PASSWORD, 12);

  // --- Reset demo tenant ---
  const existing = await Tenant.findOne({ slug: DEMO_SLUG });
  if (existing) {
    await Promise.all([
      User.deleteMany({ tenantId: existing._id }),
      Ticket.deleteMany({ tenantId: existing._id }),
      Comment.deleteMany({ tenantId: existing._id }),
      Notification.deleteMany({ tenantId: existing._id }),
      Counter.deleteOne({ _id: `ticket:${existing._id}` }),
      Tenant.deleteOne({ _id: existing._id }),
    ]);
  }

  const tenant = await Tenant.create({ name: "Zordon's Command Center", slug: DEMO_SLUG });
  const tenantId = tenant._id;

  const mk = (name, email, role, team) =>
    User.create({ tenantId, name, email, passwordHash: hash, role, team, emailVerifiedAt: new Date() });

  const [admin, manager, billy, trini, kim, ranger] = await Promise.all([
    mk('Zordon', 'admin@facility.dev', 'admin'),
    mk('Alpha 5', 'manager@facility.dev', 'manager'),
    mk('Billy Cranston', 'billy@facility.dev', 'engineer', 'Field_Hardware_Technicians'),
    mk('Trini Kwan', 'trini@facility.dev', 'engineer', 'Core_Platform_Engineers'),
    mk('Kimberly Hart', 'kim@facility.dev', 'engineer', 'Network_Infrastructure_Team'),
    mk('Jason Lee Scott', 'ranger@facility.dev', 'user'),
  ]);

  const engineers = { billy, trini, kim };

  const samples = [
    { title: 'Teleport pad #3 misfires on engage', desc: 'Teleport pads misfire intermittently, rangers rematerialize in wrong bay. Critical safety risk.', status: 'in_progress', assignee: 'billy', ageH: 3 },
    { title: 'Lab door sensors glitching', desc: 'Lab door sensors glitch and fail to detect motion, doors stay locked during emergencies.', status: 'assigned', assignee: 'billy', ageH: 30 },
    { title: 'Zord engine coolant leak detected', desc: 'Zord engine coolant leaks in hangar 2, pressure dropping fast. Urgent hardware dispatch needed.', status: 'open', assignee: null, ageH: 1 },
    { title: 'Command Center DB connection pool exhausted', desc: 'PostgreSQL deadlocks and connection pool exhausted, dashboards timing out.', status: 'assigned', assignee: 'trini', ageH: 50 },
    { title: 'Comms network packet drops to Zord fleet', desc: 'Network connectivity unstable, DNS resolution failing for fleet uplink, heavy packet loss.', status: 'in_progress', assignee: 'kim', ageH: 6 },
    { title: 'Morphin grid UI stuck in render loop', desc: 'Software UI loops on the morphin grid screen, application logic bug freezes the console.', status: 'open', assignee: null, ageH: 2 },
    { title: 'Coffee dispenser in break room offline', desc: 'Minor: the break room coffee dispenser is offline, cosmetic issue, fix whenever.', status: 'resolved', assignee: 'trini', ageH: 90 },
    { title: 'Severed power cable to north antenna', desc: 'Physical damage: severed cable to the north antenna array, requires on-site repair.', status: 'closed', assignee: 'kim', ageH: 120 },
    { title: 'Status display flicker in main hall', desc: 'Status updates flicker on the main hall display, possible refresh bug.', status: 'open', assignee: null, ageH: 8 },
  ];

  let n = 0;
  for (const s of samples) {
    const route = heuristicRoute(s.desc);
    const createdAt = hoursAgo(s.ageH);
    const ticketNumber = await Counter.next(`ticket:${tenantId}`);
    n++;
    const engineer = s.assignee ? engineers[s.assignee] : null;
    const slaDueAt = computeSlaDueAt(route.priority, createdAt);
    const terminal = ['resolved', 'closed'].includes(s.status);

    const ticket = await Ticket.create({
      tenantId,
      ticketNumber,
      title: s.title,
      description: s.desc,
      createdBy: ranger._id,
      status: s.status,
      priority: route.priority,
      category: route.category,
      summary: route.summary,
      assignedTeam: engineer?.team || route.assigned_team,
      assignedEngineer: engineer?._id || null,
      requiresHardwareDispatch: route.requires_hardware_dispatch,
      aiRouted: false,
      slaDueAt,
      slaBreached: !terminal && slaDueAt < new Date(),
      firstResponseAt: engineer ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      resolvedAt: terminal ? new Date(createdAt.getTime() + 6 * 60 * 60 * 1000) : null,
      closedAt: s.status === 'closed' ? new Date(createdAt.getTime() + 8 * 60 * 60 * 1000) : null,
      createdAt,
      statusHistory: [{ to: s.status, by: ranger._id, note: 'Seeded', at: createdAt }],
    });

    await Comment.create({
      tenantId,
      ticketId: ticket._id,
      author: ranger._id,
      body: 'Raising this — please prioritize, the Command Center is aging.',
      type: 'comment',
    });
  }

  console.log(`\n✅ Seeded tenant "${tenant.name}" with 6 users and ${n} tickets.\n`);
  console.log('Login with any of these (password: Password123):');
  console.log('  admin@facility.dev    (admin)');
  console.log('  manager@facility.dev  (manager)');
  console.log('  billy@facility.dev    (engineer)');
  console.log('  ranger@facility.dev   (user)\n');

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
