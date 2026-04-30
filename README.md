# Multi-Department Payroll Management System

Fastify + PostgreSQL payroll application with department and employee management, payroll processing, history, and payslip generation.

## Features

- Register, login, logout with session authentication
- Guarded routes (all app pages require login)
- Department CRUD with deletion protection when employees exist
- Employee CRUD with department filter and deletion protection when payroll records exist
- Payroll processing for all employees by month/year
- Duplicate payroll prevention per `employee + month + year`
- Payroll history with filter by month/year/department
- Individual payslip with full salary breakdown

## Payroll Formula

- Overtime Pay = `overtime_hours * hourly_rate`
- Gross Pay = `basic_salary + allowance + overtime_pay`
- Tax = `gross_pay * 0.08`
- EPF Employee = `gross_pay * 0.11`
- EPF Employer = `gross_pay * 0.13`
- Net Pay = `gross_pay - tax - epf_employee`

## Setup

1. Install PostgreSQL if you do not already have it.
2. Clone the repository locally:
   - `git clone https://github.com/<your-username>/<repo-name>.git`
3. Copy `.env.example` to `.env` and update the values.
4. Create the database:
   - `createdb payroll_db`
   - or use your preferred PostgreSQL client.
5. Install dependencies:
   - `npm install`
6. Start the application:
   - `npm run start`
7. Open the app in your browser:
   - `http://localhost:3000`

## Database migration / schema

- The app auto-creates tables on startup using `src/db.js`.
- If you want to create tables manually, run:
  - `psql "$DATABASE_URL" -f database/schema.sql`
- Example with default `.env.example` values:
  - `psql postgresql://postgres:postgres@localhost:5432/payroll_db -f database/schema.sql`

## Default login credentials

- There are no seeded users by default.
- Create an account via the app at `/register`.
- Alternatively, insert a user manually into the database if needed.

## Assumptions / decisions

- Uses Postgres and `DATABASE_URL` for the database connection.
- Templates are rendered from `.html` view files via Fastify.
- Session authentication is used for protected pages.
- Local development uses `cookie.secure = false`.

## GitHub submission

1. Initialize local git repo:
   - `git init`
   - `git add .`
   - `git commit -m "Initial project submission"`
2. Create a public repository on GitHub or GitLab.
3. Add the remote:
   - `git remote add origin https://github.com/<your-username>/<repo-name>.git`
4. Push to the repository:
   - `git branch -M main`
   - `git push -u origin main`

## Notes

- Do not commit `.env`; it is ignored via `.gitignore`.
- If the repo is for the submission, make sure it remains public and accessible.
