function round2(value) {
  return Number(Number(value).toFixed(2));
}

function calculatePayroll(employee) {
  const basicSalary = Number(employee.basic_salary);
  const allowance = Number(employee.allowance);
  const overtimeHours = Number(employee.overtime_hours);
  const hourlyRate = Number(employee.hourly_rate);

  const overtimePay = round2(overtimeHours * hourlyRate);
  const grossPay = round2(basicSalary + allowance + overtimePay);
  const tax = round2(grossPay * 0.08);
  const epfEmployee = round2(grossPay * 0.11);
  const epfEmployer = round2(grossPay * 0.13);
  const netPay = round2(grossPay - tax - epfEmployee);

  return {
    overtimePay,
    grossPay,
    tax,
    epfEmployee,
    epfEmployer,
    netPay,
  };
}

module.exports = { calculatePayroll };
