const sql = require('mssql');

const dbConfig = {
  server: 'ANGIE\\SQLEXPRESS',  // Cambia esto según tu configuración
  database: 'task_manager',     // Nombre de la base de datos
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

async function connectToDb() {
  try {
    await sql.connect(dbConfig);
    console.log('Conectado a la base de datos');
  } catch (err) {
    console.error('Error al conectar a la base de datos:', err);
  }
}

module.exports = {
  connectToDb,
  sql
};
