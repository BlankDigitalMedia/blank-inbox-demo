/**
 * Sample Data for Demo Mode
 * 
 * Provides realistic sample emails and contacts for demo environment.
 * All data is fictional and designed to showcase Blank Inbox features.
 */

import type { Id } from "../_generated/dataModel";

// Helper to generate timestamps (days ago)
const daysAgo = (days: number): number => {
  return Date.now() - days * 24 * 60 * 60 * 1000;
};

// Helper to generate message IDs
const messageId = (id: string): string => `<demo-${id}@blankinbox.dev>`;

// Helper to generate thread IDs (use first message ID as thread root)
const threadId = (id: string): string => `<demo-thread-${id}@blankinbox.dev>`;

export const sampleEmails = [
  // Thread 1: Welcome email thread
  {
    from: "sarah.chen@techstartup.io",
    to: "demo@blankinbox.dev",
    subject: "Welcome to TechStartup!",
    preview: "Thanks for joining our platform. We're excited to have you on board...",
    body: `<html><body>
      <h2>Welcome to TechStartup!</h2>
      <p>Hi there,</p>
      <p>Thanks for joining our platform. We're excited to have you on board!</p>
      <p>Here are some quick tips to get started:</p>
      <ul>
        <li>Complete your profile</li>
        <li>Explore our features</li>
        <li>Join our community forum</li>
      </ul>
      <p>Best regards,<br>Sarah Chen<br>Customer Success Team</p>
    </body></html>`,
    read: false,
    starred: false,
    receivedAt: daysAgo(5),
    messageId: messageId("thread1-root"),
    threadId: threadId("thread1"),
  },
  {
    from: "demo@blankinbox.dev",
    to: "sarah.chen@techstartup.io",
    subject: "Re: Welcome to TechStartup!",
    preview: "Thank you for the warm welcome! I'm excited to explore the platform...",
    body: `<html><body>
      <p>Hi Sarah,</p>
      <p>Thank you for the warm welcome! I'm excited to explore the platform.</p>
      <p>Quick question: Is there a tutorial or documentation I should start with?</p>
      <p>Thanks!</p>
    </body></html>`,
    read: true,
    starred: false,
    sent: true,
    receivedAt: daysAgo(4),
    messageId: messageId("thread1-reply1"),
    threadId: threadId("thread1"),
    inReplyTo: messageId("thread1-root"),
    references: [messageId("thread1-root")],
  },
  {
    from: "sarah.chen@techstartup.io",
    to: "demo@blankinbox.dev",
    subject: "Re: Welcome to TechStartup!",
    preview: "Great question! I'd recommend starting with our Getting Started guide...",
    body: `<html><body>
      <p>Hi there,</p>
      <p>Great question! I'd recommend starting with our <a href="#">Getting Started guide</a>.</p>
      <p>It covers all the basics and will have you up and running in no time.</p>
      <p>Let me know if you have any other questions!</p>
      <p>Best,<br>Sarah</p>
    </body></html>`,
    read: false,
    starred: true,
    receivedAt: daysAgo(3),
    messageId: messageId("thread1-reply2"),
    threadId: threadId("thread1"),
    inReplyTo: messageId("thread1-reply1"),
    references: [messageId("thread1-root"), messageId("thread1-reply1")],
  },

  // Thread 2: Project discussion
  {
    from: "mike.johnson@designstudio.com",
    to: "demo@blankinbox.dev",
    cc: "team@designstudio.com",
    subject: "Project Proposal: Website Redesign",
    preview: "I've attached our proposal for the website redesign project. Let me know your thoughts...",
    body: `<html><body>
      <h2>Website Redesign Proposal</h2>
      <p>Hi,</p>
      <p>I've attached our proposal for the website redesign project. Here's what we're thinking:</p>
      <ul>
        <li>Modern, responsive design</li>
        <li>Improved user experience</li>
        <li>SEO optimization</li>
        <li>3-month timeline</li>
      </ul>
      <p>Let me know your thoughts!</p>
      <p>Best,<br>Mike Johnson<br>Design Studio</p>
    </body></html>`,
    read: true,
    starred: false,
    receivedAt: daysAgo(7),
    messageId: messageId("thread2-root"),
    threadId: threadId("thread2"),
  },
  {
    from: "demo@blankinbox.dev",
    to: "mike.johnson@designstudio.com",
    cc: "team@designstudio.com",
    subject: "Re: Project Proposal: Website Redesign",
    preview: "Thanks for the proposal! It looks great. Can we schedule a call to discuss the timeline?",
    body: `<html><body>
      <p>Hi Mike,</p>
      <p>Thanks for the proposal! It looks great. Can we schedule a call to discuss the timeline?</p>
      <p>I'm available Tuesday or Wednesday next week.</p>
      <p>Thanks!</p>
    </body></html>`,
    read: true,
    starred: false,
    sent: true,
    receivedAt: daysAgo(6),
    messageId: messageId("thread2-reply1"),
    threadId: threadId("thread2"),
    inReplyTo: messageId("thread2-root"),
    references: [messageId("thread2-root")],
  },

  // Individual emails (no threading)
  {
    from: "newsletter@technews.com",
    to: "demo@blankinbox.dev",
    subject: "Weekly Tech News Roundup",
    preview: "This week in tech: AI breakthroughs, startup funding, and industry trends...",
    body: `<html><body>
      <h1>Weekly Tech News Roundup</h1>
      <h2>Top Stories This Week</h2>
      <ul>
        <li>AI startup raises $50M Series B</li>
        <li>New JavaScript framework gains traction</li>
        <li>Tech industry job market trends</li>
      </ul>
      <p><a href="#">Read more</a></p>
    </body></html>`,
    read: false,
    starred: false,
    receivedAt: daysAgo(1),
    messageId: messageId("newsletter-1"),
    threadId: threadId("newsletter-1"),
  },
  {
    from: "alex.martinez@financecorp.com",
    to: "demo@blankinbox.dev",
    subject: "Invoice #12345 - Payment Reminder",
    preview: "This is a friendly reminder that invoice #12345 is due in 5 days...",
    body: `<html><body>
      <p>Hi,</p>
      <p>This is a friendly reminder that invoice #12345 is due in 5 days.</p>
      <p>Amount: $1,250.00</p>
      <p>Please let me know if you have any questions.</p>
      <p>Best regards,<br>Alex Martinez<br>Finance Corp</p>
    </body></html>`,
    read: false,
    starred: false,
    receivedAt: daysAgo(2),
    messageId: messageId("invoice-1"),
    threadId: threadId("invoice-1"),
  },
  {
    from: "demo@blankinbox.dev",
    to: "support@cloudservice.com",
    subject: "Question about API rate limits",
    preview: "Hi, I'm reaching out to ask about your API rate limits for the Pro plan...",
    body: `<html><body>
      <p>Hi Support Team,</p>
      <p>I'm reaching out to ask about your API rate limits for the Pro plan.</p>
      <p>Currently using the Basic plan and considering upgrading. What are the rate limits for Pro?</p>
      <p>Thanks!</p>
    </body></html>`,
    read: true,
    starred: false,
    sent: true,
    receivedAt: daysAgo(8),
    messageId: messageId("support-1"),
    threadId: threadId("support-1"),
  },
  {
    from: "jessica.taylor@marketingagency.com",
    to: "demo@blankinbox.dev",
    subject: "Campaign Performance Report",
    preview: "Here's your monthly campaign performance report. Great results this month!",
    body: `<html><body>
      <h2>Campaign Performance Report - January</h2>
      <p>Hi there,</p>
      <p>Here's your monthly campaign performance report. Great results this month!</p>
      <table>
        <tr><th>Metric</th><th>Value</th></tr>
        <tr><td>Impressions</td><td>125,000</td></tr>
        <tr><td>Clicks</td><td>3,200</td></tr>
        <tr><td>Conversions</td><td>145</td></tr>
      </table>
      <p>Let's schedule a call to discuss next steps.</p>
      <p>Best,<br>Jessica Taylor</p>
    </body></html>`,
    read: true,
    starred: true,
    receivedAt: daysAgo(10),
    messageId: messageId("report-1"),
    threadId: threadId("report-1"),
  },
  {
    from: "demo@blankinbox.dev",
    to: "colleague@company.com",
    subject: "Meeting notes from today",
    preview: "Here are the key points from today's meeting: 1) Project timeline...",
    body: `<html><body>
      <p>Hi,</p>
      <p>Here are the key points from today's meeting:</p>
      <ol>
        <li>Project timeline moved up by 2 weeks</li>
        <li>New team member starting next Monday</li>
        <li>Budget approved for Q2 initiatives</li>
      </ol>
      <p>Let me know if you have any questions!</p>
    </body></html>`,
    read: true,
    starred: false,
    sent: true,
    receivedAt: daysAgo(12),
    messageId: messageId("meeting-1"),
    threadId: threadId("meeting-1"),
  },
  {
    from: "notifications@github.com",
    to: "demo@blankinbox.dev",
    subject: "New pull request in your repository",
    preview: "A new pull request has been opened in your repository: Feature: Add dark mode...",
    body: `<html><body>
      <p>A new pull request has been opened in your repository.</p>
      <p><strong>Feature: Add dark mode</strong></p>
      <p>Opened by: @developer123</p>
      <p><a href="#">View pull request</a></p>
    </body></html>`,
    read: false,
    starred: false,
    receivedAt: daysAgo(0.5),
    messageId: messageId("github-1"),
    threadId: threadId("github-1"),
  },
  {
    from: "demo@blankinbox.dev",
    to: "vendor@supplier.com",
    subject: "Order confirmation #ORD-789",
    preview: "Please confirm receipt of order #ORD-789. Expected delivery date: Feb 15...",
    body: `<html><body>
      <p>Hi,</p>
      <p>Please confirm receipt of order #ORD-789.</p>
      <p><strong>Expected delivery date:</strong> February 15, 2025</p>
      <p><strong>Items:</strong></p>
      <ul>
        <li>Widget A - Qty: 10</li>
        <li>Widget B - Qty: 5</li>
      </ul>
      <p>Thanks!</p>
    </body></html>`,
    read: true,
    starred: false,
    sent: true,
    receivedAt: daysAgo(14),
    messageId: messageId("order-1"),
    threadId: threadId("order-1"),
  },
];

export const sampleContacts = [
  {
    primaryEmail: "sarah.chen@techstartup.io",
    name: "Sarah Chen",
    company: "TechStartup",
    title: "Customer Success Manager",
    notes: "Very responsive and helpful. Great onboarding experience.",
    tags: ["work", "customer-success"],
    lastContactedAt: daysAgo(3),
  },
  {
    primaryEmail: "mike.johnson@designstudio.com",
    name: "Mike Johnson",
    company: "Design Studio",
    title: "Creative Director",
    notes: "Working on website redesign project. Professional and creative.",
    tags: ["work", "design", "project"],
    lastContactedAt: daysAgo(6),
  },
  {
    primaryEmail: "alex.martinez@financecorp.com",
    name: "Alex Martinez",
    company: "Finance Corp",
    title: "Account Manager",
    tags: ["work", "finance"],
    lastContactedAt: daysAgo(2),
  },
  {
    primaryEmail: "jessica.taylor@marketingagency.com",
    name: "Jessica Taylor",
    company: "Marketing Agency",
    title: "Account Executive",
    notes: "Monthly performance reports. Excellent results.",
    tags: ["work", "marketing"],
    lastContactedAt: daysAgo(10),
  },
  {
    primaryEmail: "colleague@company.com",
    name: "John Smith",
    company: "Company",
    title: "Project Manager",
    tags: ["work", "internal"],
    lastContactedAt: daysAgo(12),
  },
  {
    primaryEmail: "support@cloudservice.com",
    name: "Cloud Service Support",
    company: "Cloud Service",
    tags: ["support"],
    lastContactedAt: daysAgo(8),
  },
  {
    primaryEmail: "vendor@supplier.com",
    name: "Vendor Supplier",
    company: "Supplier Inc",
    tags: ["vendor"],
    lastContactedAt: daysAgo(14),
  },
  {
    primaryEmail: "newsletter@technews.com",
    name: "Tech News",
    company: "Tech News Media",
    tags: ["newsletter"],
    lastContactedAt: daysAgo(1),
  },
];

