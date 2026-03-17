/**
 * Dashboard Design Demo Scenario
 *
 * Simulates designing a dashboard with analytics cards, charts, and a data table
 * using the project's design system. Demonstrates: Read (skill file) → Thinking → Write (multiple) → Edit.
 */

import { DEMO_SESSION_ID } from './types';

import type { DemoEvent, DemoScript } from './types';

// ============================================
// Constants
// ============================================

const DEMO_MESSAGE_ID = 'demo-msg-skills-001';

const USER_PROMPT =
  'Design a dashboard with analytics cards, charts, and a data table using our design system.';

// ============================================
// Script Builder
// ============================================

/**
 * Build the full sequence of timed events for the dashboard design demo.
 * Demonstrates skill file reading and applying design guidelines to component creation.
 */
export function buildSkillsScript(): DemoScript {
  const events: DemoEvent[] = [];

  // --- Phase 1: Initial text ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "I'll design a comprehensive dashboard using your design system. Let me first review the design guidelines to ensure consistency.\n\n",
    },
  });

  // --- Phase 2: Read skill file ---
  const readToolId = `tool-read-skill-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readToolId,
      tool_name: 'Read',
      tool_input: {
        file_path: '/workspace/app/.claude/skills/web-design-guidelines/SKILL.md',
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 1800,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: readToolId,
      tool_name: 'Read',
      tool_output: [
        '# Web Design Guidelines',
        '',
        '## Layout',
        '- Use CSS Grid for page-level layout, Flexbox for component-level',
        '- Maintain consistent spacing with 4px/8px grid system',
        '- Cards should have 16px padding, 8px gap between items',
        '',
        '## Colors',
        '- Use semantic color tokens (--primary, --muted, --destructive)',
        '- Charts: Use the 6-color palette from the design system',
        '',
        '## Typography',
        '- Dashboard headers: text-2xl font-semibold',
        '- Card titles: text-sm font-medium text-muted-foreground',
        '- Metric values: text-3xl font-bold tracking-tight',
        '',
        '## Accessibility',
        '- All interactive elements need focus-visible outlines',
        '- Color alone should not convey information (use icons/patterns)',
        '- Data tables need proper <th> scope attributes',
      ].join('\n'),
      success: true,
    },
  });

  // --- Phase 3: Thinking ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:thinking',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "Based on the design guidelines, I'll use CSS Grid for the dashboard layout with a 4px/8px spacing system. The analytics cards should follow the card pattern: text-sm font-medium for labels, text-3xl font-bold for metric values. For charts, I'll use the 6-color palette from the design system with proper accessible patterns. The data table needs semantic <th> elements with scope attributes. I'll also ensure all interactive elements have focus-visible outlines.",
      duration_ms: 3800,
    },
  });

  // --- Phase 4: Write Dashboard component ---
  const writeDashboardId = `tool-write-dashboard-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 3800,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeDashboardId,
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspace/app/src/components/dashboard/Dashboard.tsx',
        content: [
          "import type { FC } from 'react';",
          '',
          "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';",
          "import { AnalyticsChart } from './AnalyticsChart';",
          "import { DataTable } from './DataTable';",
          '',
          'interface MetricCardProps {',
          '  readonly title: string;',
          '  readonly value: string;',
          '  readonly change: number;',
          '  readonly icon: React.ReactNode;',
          '}',
          '',
          'const MetricCard: FC<MetricCardProps> = ({ title, value, change, icon }) => (',
          '  <Card>',
          '    <CardHeader className="flex flex-row items-center justify-between pb-2">',
          '      <CardTitle className="text-sm font-medium text-muted-foreground">',
          '        {title}',
          '      </CardTitle>',
          '      {icon}',
          '    </CardHeader>',
          '    <CardContent>',
          '      <div className="text-3xl font-bold tracking-tight">{value}</div>',
          '      <p className={`text-xs mt-1 ${change >= 0 ? "text-green-600" : "text-red-600"}`}>',
          '        {change >= 0 ? "+" : ""}{change}% from last month',
          '      </p>',
          '    </CardContent>',
          '  </Card>',
          ');',
          '',
          'export const Dashboard: FC = () => (',
          '  <div className="p-6 space-y-6">',
          '    <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>',
          '',
          '    {/* Metric Cards Grid */}',
          '    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">',
          '      <MetricCard title="Total Revenue" value="$45,231" change={20.1} icon={<DollarIcon />} />',
          '      <MetricCard title="Active Users" value="2,350" change={10.5} icon={<UsersIcon />} />',
          '      <MetricCard title="Conversion Rate" value="3.2%" change={-2.4} icon={<ChartIcon />} />',
          '      <MetricCard title="Avg. Session" value="4m 32s" change={12.3} icon={<ClockIcon />} />',
          '    </div>',
          '',
          '    {/* Charts Row */}',
          '    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">',
          '      <AnalyticsChart type="revenue" title="Revenue Over Time" />',
          '      <AnalyticsChart type="users" title="User Growth" />',
          '    </div>',
          '',
          '    {/* Data Table */}',
          '    <DataTable />',
          '  </div>',
          ');',
        ].join('\n'),
      },
    },
  });

  events.push({
    delay: 2800,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeDashboardId,
      tool_name: 'Write',
      tool_output: 'File written successfully',
      success: true,
    },
  });

  // --- Phase 5: Chart component text ---
  events.push({
    delay: 500,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        "Now the chart component with the design system's color palette and accessible patterns.\n\n",
    },
  });

  // --- Phase 6: Write AnalyticsChart ---
  const writeChartId = `tool-write-chart-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeChartId,
      tool_name: 'Write',
      tool_input: {
        file_path: '/workspace/app/src/components/dashboard/AnalyticsChart.tsx',
        content: [
          "import type { FC } from 'react';",
          '',
          "import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';",
          'import {',
          '  ResponsiveContainer,',
          '  AreaChart,',
          '  Area,',
          '  XAxis,',
          '  YAxis,',
          '  CartesianGrid,',
          '  Tooltip,',
          "} from 'recharts';",
          '',
          'interface AnalyticsChartProps {',
          '  readonly type: "revenue" | "users";',
          '  readonly title: string;',
          '}',
          '',
          'const CHART_COLORS = {',
          '  revenue: "hsl(var(--primary))",',
          '  users: "hsl(var(--chart-2))",',
          '} as const;',
          '',
          'const MOCK_DATA = [',
          '  { month: "Jan", revenue: 4000, users: 1200 },',
          '  { month: "Feb", revenue: 3800, users: 1350 },',
          '  { month: "Mar", revenue: 5200, users: 1500 },',
          '  { month: "Apr", revenue: 4800, users: 1680 },',
          '  { month: "May", revenue: 6100, users: 1890 },',
          '  { month: "Jun", revenue: 5900, users: 2100 },',
          '];',
          '',
          'export const AnalyticsChart: FC<AnalyticsChartProps> = ({ type, title }) => (',
          '  <Card>',
          '    <CardHeader>',
          '      <CardTitle className="text-sm font-medium text-muted-foreground">',
          '        {title}',
          '      </CardTitle>',
          '    </CardHeader>',
          '    <CardContent>',
          '      <ResponsiveContainer width="100%" height={300}>',
          '        <AreaChart data={MOCK_DATA}>',
          '          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />',
          '          <XAxis dataKey="month" className="text-xs" />',
          '          <YAxis className="text-xs" />',
          '          <Tooltip />',
          '          <Area',
          '            type="monotone"',
          '            dataKey={type}',
          '            stroke={CHART_COLORS[type]}',
          '            fill={CHART_COLORS[type]}',
          '            fillOpacity={0.1}',
          '          />',
          '        </AreaChart>',
          '      </ResponsiveContainer>',
          '    </CardContent>',
          '  </Card>',
          ');',
        ].join('\n'),
      },
    },
  });

  events.push({
    delay: 2500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: writeChartId,
      tool_name: 'Write',
      tool_output: 'File written successfully',
      success: true,
    },
  });

  // --- Phase 7: Edit CSS ---
  const editCssId = `tool-edit-css-${crypto.randomUUID().slice(0, 8)}`;

  events.push({
    delay: 300,
    message: {
      type: 'tool:start',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: editCssId,
      tool_name: 'Edit',
      tool_input: {
        file_path: '/workspace/app/src/styles/dashboard.css',
        old_string: '/* Dashboard styles */',
        new_string: [
          '/* Dashboard styles */',
          '',
          '.dashboard-grid {',
          '  display: grid;',
          '  gap: 1rem;',
          '  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));',
          '}',
          '',
          '.metric-card {',
          '  padding: 1rem;',
          '  border-radius: var(--radius);',
          '  transition: box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1);',
          '}',
          '',
          '.metric-card:hover {',
          '  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08);',
          '}',
          '',
          '@media (prefers-reduced-motion: reduce) {',
          '  .metric-card {',
          '    transition: none;',
          '  }',
          '}',
        ].join('\n'),
      },
      content_offset: 0,
    },
  });

  events.push({
    delay: 1500,
    message: {
      type: 'tool:end',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      tool_id: editCssId,
      tool_name: 'Edit',
      tool_output: 'File edited successfully (19 lines added)',
      success: true,
    },
  });

  // --- Phase 8: Summary ---
  events.push({
    delay: 600,
    message: {
      type: 'agent:chunk',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      content:
        'The dashboard is complete, following the design system guidelines:\n\n' +
        '- **Metric Cards** \u2014 4-column grid with semantic color tokens, `text-3xl font-bold` for values per the typography spec\n' +
        "- **Analytics Charts** \u2014 Area charts using the design system's 6-color palette with `fillOpacity` for accessible distinction\n" +
        '- **Responsive Layout** \u2014 CSS Grid with `auto-fit` breakpoints, 8px gap system\n' +
        '- **Accessibility** \u2014 `prefers-reduced-motion` respected, focus-visible outlines on interactive elements\n',
    },
  });

  // --- Phase 9: Complete ---
  events.push({
    delay: 800,
    message: {
      type: 'agent:complete',
      uuid: crypto.randomUUID(),
      session_id: DEMO_SESSION_ID,
      message_id: DEMO_MESSAGE_ID,
      duration_ms: 15000,
    },
  });

  return {
    title: 'Dashboard Design',
    userPrompt: USER_PROMPT,
    events,
  };
}
