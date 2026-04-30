require("dotenv").config();
const path = require("path");
const bcrypt = require("bcrypt");
const PDFDocument = require("pdfkit");
const { stringify } = require("csv-stringify");
const Fastify = require("fastify");
const fastifyFormbody = require("@fastify/formbody");
const fastifyCookie = require("@fastify/cookie");
const fastifySession = require("@fastify/session");
const fastifyView = require("@fastify/view");
const ejs = require("ejs");
const { pool, initDb } = require("./db");
const { calculatePayroll } = require("./payroll");

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT || 3000);

const monthOptions = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function formatMoney(value) {
  return `RM ${Number(value).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isAuthenticated(request) {
  return Boolean(request.session.user);
}

function authGuard(request, reply, done) {
  if (!isAuthenticated(request)) {
    reply.redirect("/login");
    return;
  }
  done();
}

function getCurrentUser(request) {
  return request.session.user || null;
}

function getFlashMessage(request) {
  const flash = request.session.flash || null;
  request.session.flash = null;
  return flash;
}

function setFlash(request, type, text) {
  request.session.flash = { type, text };
}

async function render(reply, view, data = {}) {
  return reply.view("layout.html", { ...data, bodyView: view });
}

app.register(fastifyFormbody);
app.register(fastifyCookie);
app.register(fastifySession, {
  secret:
    process.env.SESSION_SECRET ||
    "please-change-this-session-secret-in-production-at-least-32-char",
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 },
  saveUninitialized: false,
});
app.register(fastifyView, {
  engine: { ejs },
  root: path.join(__dirname, "..", "views"),
  viewExt: "html",
  layout: false,
  includeViewExtension: true,
});

app.get("/", async (request, reply) => {
  if (isAuthenticated(request)) {
    return reply.redirect("/dashboard");
  }
  return reply.redirect("/login");
});

app.get("/login", async (request, reply) => {
  if (isAuthenticated(request)) {
    return reply.redirect("/dashboard");
  }
  return render(reply, "auth/login", {
    title: "Login",
    user: null,
    flash: getFlashMessage(request),
  });
});

app.post("/login", async (request, reply) => {
  const { email, password } = request.body;
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  const user = result.rows[0];

  if (!user) {
    setFlash(request, "error", "Invalid email or password.");
    return reply.redirect("/login");
  }

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) {
    setFlash(request, "error", "Invalid email or password.");
    return reply.redirect("/login");
  }

  request.session.user = { id: user.id, name: user.name, email: user.email };
  setFlash(request, "success", "Welcome back.");
  return reply.redirect("/dashboard");
});

app.get("/register", async (request, reply) => {
  if (isAuthenticated(request)) {
    return reply.redirect("/dashboard");
  }
  return render(reply, "auth/register", {
    title: "Register",
    user: null,
    flash: getFlashMessage(request),
  });
});

app.post("/register", async (request, reply) => {
  const { name, email, password } = request.body;
  if (!name || !email || !password) {
    setFlash(request, "error", "Please fill all fields.");
    return reply.redirect("/register");
  }

  const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (exists.rowCount > 0) {
    setFlash(request, "error", "Email is already registered.");
    return reply.redirect("/register");
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query("INSERT INTO users(name, email, password) VALUES($1, $2, $3)", [
    name.trim(),
    email.trim().toLowerCase(),
    hash,
  ]);

  setFlash(request, "success", "Registration successful. Please login.");
  return reply.redirect("/login");
});

app.post("/logout", { preHandler: authGuard }, async (request, reply) => {
  request.session.destroy();
  return reply.redirect("/login");
});

app.get("/dashboard", { preHandler: authGuard }, async (request, reply) => {
  const departments = await pool.query("SELECT COUNT(*)::int AS total FROM departments");
  const employees = await pool.query("SELECT COUNT(*)::int AS total FROM employees");
  const payroll = await pool.query("SELECT COUNT(*)::int AS total FROM payroll_records");

  return render(reply, "dashboard", {
    title: "Dashboard",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    stats: {
      departments: departments.rows[0].total,
      employees: employees.rows[0].total,
      payrollRecords: payroll.rows[0].total,
    },
  });
});

app.get("/departments", { preHandler: authGuard }, async (request, reply) => {
  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  return render(reply, "departments/list", {
    title: "Departments",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    departments: departments.rows,
    editing: null,
  });
});

app.get("/departments/:id/edit", { preHandler: authGuard }, async (request, reply) => {
  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  const editing = await pool.query("SELECT * FROM departments WHERE id = $1", [
    Number(request.params.id),
  ]);
  return render(reply, "departments/list", {
    title: "Departments",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    departments: departments.rows,
    editing: editing.rows[0] || null,
  });
});

app.post("/departments", { preHandler: authGuard }, async (request, reply) => {
  const { name } = request.body;
  if (!name || !name.trim()) {
    setFlash(request, "error", "Department name is required.");
    return reply.redirect("/departments");
  }
  try {
    await pool.query("INSERT INTO departments(name) VALUES($1)", [name.trim()]);
    setFlash(request, "success", "Department created.");
  } catch (error) {
    setFlash(request, "error", "Failed to create department. Name must be unique.");
  }
  return reply.redirect("/departments");
});

app.post("/departments/:id", { preHandler: authGuard }, async (request, reply) => {
  const { name } = request.body;
  const id = Number(request.params.id);
  if (!name || !name.trim()) {
    setFlash(request, "error", "Department name is required.");
    return reply.redirect(`/departments/${id}/edit`);
  }
  try {
    await pool.query("UPDATE departments SET name = $1, updated_at = NOW() WHERE id = $2", [
      name.trim(),
      id,
    ]);
    setFlash(request, "success", "Department updated.");
  } catch (error) {
    setFlash(request, "error", "Failed to update department. Name must be unique.");
  }
  return reply.redirect("/departments");
});

app.post("/departments/:id/delete", { preHandler: authGuard }, async (request, reply) => {
  const id = Number(request.params.id);
  const employees = await pool.query("SELECT COUNT(*)::int AS total FROM employees WHERE department_id = $1", [
    id,
  ]);
  if (employees.rows[0].total > 0) {
    setFlash(request, "error", "Cannot delete department with employees.");
    return reply.redirect("/departments");
  }
  await pool.query("DELETE FROM departments WHERE id = $1", [id]);
  setFlash(request, "success", "Department deleted.");
  return reply.redirect("/departments");
});

app.get("/employees", { preHandler: authGuard }, async (request, reply) => {
  const departmentId = request.query.department_id ? Number(request.query.department_id) : null;
  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  const employees = await pool.query(
    `SELECT e.*, d.name AS department_name
     FROM employees e
     INNER JOIN departments d ON d.id = e.department_id
     WHERE ($1::int IS NULL OR e.department_id = $1)
     ORDER BY e.name`,
    [departmentId]
  );

  return render(reply, "employees/list", {
    title: "Employees",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    departments: departments.rows,
    employees: employees.rows,
    selectedDepartmentId: departmentId,
    editing: null,
  });
});

app.get("/employees/new", { preHandler: authGuard }, async (request, reply) => {
  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  return render(reply, "employees/form", {
    title: "Create Employee",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    departments: departments.rows,
    employee: null,
    action: "/employees",
  });
});

app.get("/employees/:id/edit", { preHandler: authGuard }, async (request, reply) => {
  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  const employee = await pool.query("SELECT * FROM employees WHERE id = $1", [
    Number(request.params.id),
  ]);
  if (employee.rowCount === 0) {
    setFlash(request, "error", "Employee not found.");
    return reply.redirect("/employees");
  }
  return render(reply, "employees/form", {
    title: "Edit Employee",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    departments: departments.rows,
    employee: employee.rows[0],
    action: `/employees/${request.params.id}`,
  });
});

app.post("/employees", { preHandler: authGuard }, async (request, reply) => {
  const { department_id, name, position, basic_salary, allowance, overtime_hours, hourly_rate } =
    request.body;

  await pool.query(
    `INSERT INTO employees(department_id, name, position, basic_salary, allowance, overtime_hours, hourly_rate)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      Number(department_id),
      name.trim(),
      position.trim(),
      Number(basic_salary),
      Number(allowance),
      Number(overtime_hours),
      Number(hourly_rate),
    ]
  );
  setFlash(request, "success", "Employee created.");
  return reply.redirect("/employees");
});

app.post("/employees/:id", { preHandler: authGuard }, async (request, reply) => {
  const { department_id, name, position, basic_salary, allowance, overtime_hours, hourly_rate } =
    request.body;
  const id = Number(request.params.id);

  await pool.query(
    `UPDATE employees
      SET department_id = $1,
          name = $2,
          position = $3,
          basic_salary = $4,
          allowance = $5,
          overtime_hours = $6,
          hourly_rate = $7,
          updated_at = NOW()
      WHERE id = $8`,
    [
      Number(department_id),
      name.trim(),
      position.trim(),
      Number(basic_salary),
      Number(allowance),
      Number(overtime_hours),
      Number(hourly_rate),
      id,
    ]
  );
  setFlash(request, "success", "Employee updated.");
  return reply.redirect("/employees");
});

app.post("/employees/:id/delete", { preHandler: authGuard }, async (request, reply) => {
  const id = Number(request.params.id);
  const payrollCount = await pool.query(
    "SELECT COUNT(*)::int AS total FROM payroll_records WHERE employee_id = $1",
    [id]
  );
  if (payrollCount.rows[0].total > 0) {
    setFlash(request, "error", "Cannot delete employee with payroll records.");
    return reply.redirect("/employees");
  }
  await pool.query("DELETE FROM employees WHERE id = $1", [id]);
  setFlash(request, "success", "Employee deleted.");
  return reply.redirect("/employees");
});

app.get("/payroll/run", { preHandler: authGuard }, async (request, reply) => {
  return render(reply, "payroll/run", {
    title: "Run Payroll",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    months: monthOptions,
    year: new Date().getFullYear(),
  });
});

app.post("/payroll/run", { preHandler: authGuard }, async (request, reply) => {
  const month = Number(request.body.month);
  const year = Number(request.body.year);
  const employees = await pool.query("SELECT * FROM employees ORDER BY id");

  let inserted = 0;
  let skipped = 0;

  for (const employee of employees.rows) {
    const existing = await pool.query(
      "SELECT id FROM payroll_records WHERE employee_id = $1 AND month = $2 AND year = $3",
      [employee.id, month, year]
    );
    if (existing.rowCount > 0) {
      skipped += 1;
      continue;
    }

    const calc = calculatePayroll(employee);
    await pool.query(
      `INSERT INTO payroll_records(employee_id, month, year, gross_pay, overtime_pay, tax, epf_employee, epf_employer, net_pay)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        employee.id,
        month,
        year,
        calc.grossPay,
        calc.overtimePay,
        calc.tax,
        calc.epfEmployee,
        calc.epfEmployer,
        calc.netPay,
      ]
    );
    inserted += 1;
  }

  setFlash(
    request,
    "success",
    `Payroll processed for ${month}/${year}. Created: ${inserted}, skipped duplicates: ${skipped}.`
  );
  return reply.redirect("/payroll/history");
});

app.get("/payroll/history", { preHandler: authGuard }, async (request, reply) => {
  const month = request.query.month ? Number(request.query.month) : null;
  const year = request.query.year ? Number(request.query.year) : null;
  const departmentId = request.query.department_id ? Number(request.query.department_id) : null;

  const departments = await pool.query("SELECT * FROM departments ORDER BY name");
  const records = await pool.query(
    `SELECT pr.*, e.name AS employee_name, e.position, e.basic_salary, e.allowance, e.overtime_hours, e.hourly_rate,
            d.name AS department_name
     FROM payroll_records pr
     INNER JOIN employees e ON e.id = pr.employee_id
     INNER JOIN departments d ON d.id = e.department_id
     WHERE ($1::int IS NULL OR pr.month = $1)
       AND ($2::int IS NULL OR pr.year = $2)
       AND ($3::int IS NULL OR d.id = $3)
     ORDER BY pr.year DESC, pr.month DESC, e.name ASC`,
    [month, year, departmentId]
  );

  return render(reply, "payroll/history", {
    title: "Payroll History",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    records: records.rows,
    months: monthOptions,
    filters: { month, year, departmentId },
    departments: departments.rows,
    formatMoney,
  });
});

app.get("/payroll/:id/payslip", { preHandler: authGuard }, async (request, reply) => {
  const record = await pool.query(
    `SELECT pr.*, e.name AS employee_name, e.position, e.basic_salary, e.allowance, e.overtime_hours, e.hourly_rate,
            d.name AS department_name
     FROM payroll_records pr
     INNER JOIN employees e ON e.id = pr.employee_id
     INNER JOIN departments d ON d.id = e.department_id
     WHERE pr.id = $1`,
    [Number(request.params.id)]
  );

  if (record.rowCount === 0) {
    setFlash(request, "error", "Payroll record not found.");
    return reply.redirect("/payroll/history");
  }

  return render(reply, "payroll/payslip", {
    title: "Payslip",
    user: getCurrentUser(request),
    flash: getFlashMessage(request),
    row: record.rows[0],
    months: monthOptions,
    formatMoney,
  });
});

app.post("/payroll/:id/delete", { preHandler: authGuard }, async (request, reply) => {
  const recordId = Number(request.params.id);
  
  const record = await pool.query(
    "SELECT * FROM payroll_records WHERE id = $1",
    [recordId]
  );

  if (record.rowCount === 0) {
    setFlash(request, "error", "Payroll record not found.");
    return reply.redirect("/payroll/history");
  }

  await pool.query(
    "DELETE FROM payroll_records WHERE id = $1",
    [recordId]
  );

  setFlash(request, "success", "Payroll record deleted successfully.");
  return reply.redirect("/payroll/history");
});

app.get("/payroll/:id/export/pdf", { preHandler: authGuard }, async (request, reply) => {
  const record = await pool.query(
    `SELECT pr.*, e.name AS employee_name, e.position, e.basic_salary, e.allowance, e.overtime_hours, e.hourly_rate,
            d.name AS department_name
     FROM payroll_records pr
     INNER JOIN employees e ON e.id = pr.employee_id
     INNER JOIN departments d ON d.id = e.department_id
     WHERE pr.id = $1`,
    [Number(request.params.id)]
  );

  if (record.rowCount === 0) {
    return reply.code(404).send({ error: "Record not found" });
  }

  const row = record.rows[0];
  const monthName = monthOptions.find((m) => Number(m.value) === Number(row.month))?.label || row.month;

  const doc = new PDFDocument();
  const chunks = [];
  const filename = `payslip-${row.employee_name.replace(/\s+/g, "-")}-${row.month}-${row.year}.pdf`;

  return new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(chunks);
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="${filename}"`);
      resolve(reply.send(pdfBuffer));
    });
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text("PAYSLIP", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").text(`Period: ${monthName} ${row.year}`, { align: "center" });
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text("Employee Information");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Employee: ${row.employee_name}`);
    doc.text(`Position: ${row.position}`);
    doc.text(`Department: ${row.department_name}`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Earnings");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Basic Salary: ${formatMoney(row.basic_salary)}`);
    doc.text(`Allowance: ${formatMoney(row.allowance)}`);
    doc.text(`Overtime Pay: ${formatMoney(row.overtime_pay)}`);
    doc.text(`Gross Pay: ${formatMoney(row.gross_pay)}`, { underline: true });
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12).text("Deductions");
    doc.font("Helvetica").fontSize(10);
    doc.text(`Tax (8%): ${formatMoney(row.tax)}`);
    doc.text(`EPF Employee (11%): ${formatMoney(row.epf_employee)}`);
    doc.text(`EPF Employer (13%): ${formatMoney(row.epf_employer)}`);
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(14).text(`NET PAY: ${formatMoney(row.net_pay)}`, { underline: true });

    doc.end();
  });
});

app.get("/payroll/:id/export/csv", { preHandler: authGuard }, async (request, reply) => {
  const record = await pool.query(
    `SELECT pr.*, e.name AS employee_name, e.position, e.basic_salary, e.allowance, e.overtime_hours, e.hourly_rate,
            d.name AS department_name
     FROM payroll_records pr
     INNER JOIN employees e ON e.id = pr.employee_id
     INNER JOIN departments d ON d.id = e.department_id
     WHERE pr.id = $1`,
    [Number(request.params.id)]
  );

  if (record.rowCount === 0) {
    return reply.code(404).send({ error: "Record not found" });
  }

  const row = record.rows[0];
  const monthName = monthOptions.find((m) => Number(m.value) === Number(row.month))?.label || row.month;

  const csvData = [
    ["Payslip Report"],
    [""],
    ["Employee Information"],
    ["Employee", row.employee_name],
    ["Position", row.position],
    ["Department", row.department_name],
    ["Period", `${monthName} ${row.year}`],
    [""],
    ["Earnings"],
    ["Basic Salary", row.basic_salary],
    ["Allowance", row.allowance],
    ["Overtime Pay", row.overtime_pay],
    ["Gross Pay", row.gross_pay],
    [""],
    ["Deductions"],
    ["Tax (8%)", row.tax],
    ["EPF Employee (11%)", row.epf_employee],
    ["EPF Employer (13%)", row.epf_employer],
    [""],
    ["Net Pay", row.net_pay],
  ];

  const filename = `payslip-${row.employee_name.replace(/\s+/g, "-")}-${row.month}-${row.year}.csv`;

  reply.header("Content-Type", "text/csv");
  reply.header("Content-Disposition", `attachment; filename="${filename}"`);

  return new Promise((resolve, reject) => {
    stringify(csvData, (err, output) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(reply.send(output));
    });
  });
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  setFlash(request, "error", "An unexpected error occurred.");
  if (isAuthenticated(request)) {
    return reply.redirect("/dashboard");
  }
  return reply.redirect("/login");
});

async function start() {
  await initDb();
  await app.listen({ port: PORT, host: "0.0.0.0" });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
