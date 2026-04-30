# Multi-Department Payroll Management System

Fastify + PostgreSQL payroll application with department and employee management, payroll processing, history, and payslip generation

## Setup

1. Install PostgreSQL if you do not already have it.
2. Clone the repository locally:
   - `git clone https://github.com/<your-username>/<repo-name>.git`
3. Create a new .env file in the root directory of the project and add the following configuration:
   -`PORT=3000
     DATABASE_URL=postgresql://postgres:<your-username>@localhost:5432/payroll_db
     SESSION_SECRET=replace-with-your-strong-secret-key`
4. Create the database:
   - `createdb payroll_db`
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
