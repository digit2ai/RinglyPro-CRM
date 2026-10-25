'use strict';
// Plan base (origen='plan'), exactly as the owner wrote it on 2026-10-25.
// Validation: ingresos 47,568.48 · egresos 43,100.00 · saldo final 4,468.48 ·
// saldo mínimo 68.48 el 2026-12-11. The SIT checks all four.
const CSV = `
2026-10-25,Ahorro 1,ingreso,4689.48,ahorro
2026-10-25,Ahorro 2,ingreso,2765.00,ahorro
2026-10-25,Ahorro 3,ingreso,814.00,ahorro
2026-10-25,Ahorro 4,ingreso,700.00,ahorro
2026-10-30,Ahorro 5,ingreso,11200.00,ahorro
2026-10-30,Inversión,egreso,15500.00,inversion
2026-10-30,Gastos semana,egreso,100.00,gasto_semanal
2026-11-06,Salario,ingreso,3800.00,salario
2026-11-06,Ingreso extra,ingreso,400.00,ingreso_extra
2026-11-06,Corte – noviembre,egreso,4300.00,corte
2026-11-06,Pago Lina – noviembre,egreso,1500.00,pago_lina
2026-11-06,Gastos semana,egreso,100.00,gasto_semanal
2026-11-13,Gastos semana,egreso,100.00,gasto_semanal
2026-11-20,Salario,ingreso,3800.00,salario
2026-11-20,Gastos semana,egreso,100.00,gasto_semanal
2026-11-27,Gastos semana,egreso,100.00,gasto_semanal
2026-11-30,Casa de mi hija,egreso,4500.00,hija
2026-12-04,Salario,ingreso,3800.00,salario
2026-12-04,Pago Lina – diciembre,egreso,1500.00,pago_lina
2026-12-04,Gastos semana,egreso,100.00,gasto_semanal
2026-12-06,Ingreso extra,ingreso,400.00,ingreso_extra
2026-12-06,Corte – diciembre,egreso,4300.00,corte
2026-12-11,Gastos semana,egreso,100.00,gasto_semanal
2026-12-18,Salario,ingreso,3800.00,salario
2026-12-18,Gastos semana,egreso,100.00,gasto_semanal
2026-12-25,Gastos semana,egreso,100.00,gasto_semanal
2027-01-01,Salario,ingreso,3800.00,salario
2027-01-01,Pago Lina – enero,egreso,1500.00,pago_lina
2027-01-01,Gastos semana,egreso,100.00,gasto_semanal
2027-01-06,Corte – enero,egreso,4300.00,corte
2027-01-08,Gastos semana,egreso,100.00,gasto_semanal
2027-01-15,Salario,ingreso,3800.00,salario
2027-01-15,Gastos semana,egreso,100.00,gasto_semanal
2027-01-22,Gastos semana,egreso,100.00,gasto_semanal
2027-01-29,Salario,ingreso,3800.00,salario
2027-01-29,Corte – febrero,egreso,4300.00,corte
2027-01-29,Gastos semana,egreso,100.00,gasto_semanal
`;

function seedRows() {
  return CSV.trim().split('\n').map(line => {
    const [fecha, concepto, tipo, monto, categoria] = line.split(',');
    return { fecha, concepto, tipo, monto, categoria, origen: 'plan', estado: 'pendiente' };
  });
}

module.exports = { seedRows };
