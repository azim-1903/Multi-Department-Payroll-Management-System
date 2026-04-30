const { Pool } = require("pg");

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/payroll_db";

const pool = new Pool({
  connectionString,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS employees (
      id SERIAL PRIMARY KEY,
      department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      name VARCHAR(120) NOT NULL,
      position VARCHAR(120) NOT NULL,
      basic_salary DECIMAL(10,2) NOT NULL DEFAULT 0,
      allowance DECIMAL(10,2) NOT NULL DEFAULT 0,
      overtime_hours INT NOT NULL DEFAULT 0,
      hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payroll_records (
      id SERIAL PRIMARY KEY,
      employee_id INT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      month SMALLINT NOT NULL CHECK (month BETWEEN 1 AND 12),
      year SMALLINT NOT NULL,
      gross_pay DECIMAL(10,2) NOT NULL,
      overtime_pay DECIMAL(10,2) NOT NULL,
      tax DECIMAL(10,2) NOT NULL,
      epf_employee DECIMAL(10,2) NOT NULL,
      epf_employer DECIMAL(10,2) NOT NULL,
      net_pay DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_employee_month_year UNIQUE(employee_id, month, year)
    );
  `);
}

module.exports = { pool, initDb };
