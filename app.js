const express = require('express');
const bodyParser = require('body-parser');
const { connectToDb, sql } = require('./dbConfig');

const app = express();
app.use(bodyParser.json());

// Conectar a la base de datos antes de manejar las solicitudes
app.use(async (req, res, next) => {
  await connectToDb();
  next();
});

// 1. GET todas las tareas con los usuarios asociados
app.get('/tasks', async (req, res) => {
  try {
    const result = await sql.query`
      SELECT t.id, t.title, t.date, t.completed, 
      STRING_AGG(tu.userId, ',') as users
      FROM Tasks t
      JOIN TaskUsers tu ON t.id = tu.taskId
      GROUP BY t.id, t.title, t.date, t.completed
    `;
    const tasks = result.recordset.map(row => ({
      id: row.id,
      title: row.title,
      date: row.date,
      completed: row.completed,
      users: row.users.split(',').map(Number)
    }));
    res.json(tasks);
  } catch (err) {
    res.status(500).send('Error al obtener las tareas');
  }
});

// 2. GET todos los usuarios con sus habilidades
app.get('/users', async (req, res) => {
  try {
    const result = await sql.query`
      SELECT u.userId, u.name, u.age, 
      STRING_AGG(us.skill, ',') as skills
      FROM Users u
      JOIN UserSkills us ON u.userId = us.userId
      GROUP BY u.userId, u.name, u.age
    `;
    const users = result.recordset.map(row => ({
      userId: row.userId,
      name: row.name,
      age: row.age,
      skills: row.skills.split(',')
    }));
    res.json(users);
  } catch (err) {
    res.status(500).send('Error al obtener los usuarios');
  }
});

// 3. POST crear un nuevo usuario
app.post('/users', async (req, res) => {
  const { name, age, skills } = req.body;
  try {
    const result = await sql.query`
      INSERT INTO Users (name, age) VALUES (${name}, ${age});
      SELECT SCOPE_IDENTITY() AS userId
    `;
    const userId = result.recordset[0].userId;
    for (const skill of skills) {
      await sql.query`INSERT INTO UserSkills (userId, skill) VALUES (${userId}, ${skill})`;
    }
    res.status(201).send('Usuario creado');
  } catch (err) {
    res.status(500).send('Error al crear el usuario');
  }
});

// 4. POST crear una nueva tarea
app.post('/tasks', async (req, res) => {
  const { title, date, completed, users } = req.body;
  try {
    const result = await sql.query`
      INSERT INTO Tasks (title, date, completed) VALUES (${title}, ${date}, ${completed});
      SELECT SCOPE_IDENTITY() AS taskId
    `;
    const taskId = result.recordset[0].taskId;
    for (const userId of users) {
      await sql.query`INSERT INTO TaskUsers (taskId, userId) VALUES (${taskId}, ${userId})`;
    }
    res.status(201).send('Tarea creada');
  } catch (err) {
    res.status(500).send('Error al crear la tarea');
  }
});

// 5. PUT actualizar un usuario
app.put('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, age, skills } = req.body;
  try {
    await sql.query`
      UPDATE Users SET name = ${name}, age = ${age} WHERE userId = ${userId}
    `;
    await sql.query`DELETE FROM UserSkills WHERE userId = ${userId}`;
    for (const skill of skills) {
      await sql.query`INSERT INTO UserSkills (userId, skill) VALUES (${userId}, ${skill})`;
    }
    res.send('Usuario actualizado');
  } catch (err) {
    res.status(500).send('Error al actualizar el usuario');
  }
});

// 6. PUT actualizar una tarea
app.put('/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, date, completed, users } = req.body;
  try {
    await sql.query`
      UPDATE Tasks SET title = ${title}, date = ${date}, completed = ${completed} WHERE id = ${id}
    `;
    await sql.query`DELETE FROM TaskUsers WHERE taskId = ${id}`;
    for (const userId of users) {
      await sql.query`INSERT INTO TaskUsers (taskId, userId) VALUES (${id}, ${userId})`;
    }
    res.send('Tarea actualizada');
  } catch (err) {
    res.status(500).send('Error al actualizar la tarea');
  }
});

// 7. DELETE eliminar un usuario
app.delete('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    await sql.query`DELETE FROM Users WHERE userId = ${userId}`;
    await sql.query`DELETE FROM UserSkills WHERE userId = ${userId}`;
    res.send('Usuario eliminado');
  } catch (err) {
    res.status(500).send('Error al eliminar el usuario');
  }
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
