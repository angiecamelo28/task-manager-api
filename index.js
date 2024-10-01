const express = require('express');
const app = express();
const connection = require('./config/database');

//conexion a la base de datos
connection.on('connect', () => {
  console.log('Conexión exitosa a la base de datos');
});

// Establecer el evento 'error' para manejar errores de conexión
connection.on('error', (error) => {
  console.error('Error de conexión a la base de datos: ', error);
});

// Cerrar la conexión al finalizar
process.on('SIGINT', () => {
  connection.end();
  process.exit();
});

// Middleware para analizar el cuerpo de la solicitud en formato JSON
app.use(express.json());


// 1. GET todas las tareas con las tareas asociados
app.get('/api/tasks', (req, res) => {
  const query = `
    SELECT t.id, t.title, DATE_FORMAT(t.date, '%Y-%m-%d') as date, 
      t.completed, GROUP_CONCAT(tu.userId SEPARATOR ',') as users
    FROM Tasks t
    JOIN TaskUsers tu ON t.id = tu.taskId
    GROUP BY t.id, t.title, t.date, t.completed;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error al ejecutar la consulta: ', error);
      res.status(500).send('Error al obtener los datos');
      return;
    }

    const formattedResults = results.map(row => {
      return {
        id: row.id,
        title: row.title,
        date: row.date,
        completed: !!row.completed,
        users: row.users.split(',').map(Number)
      };
    });

    res.send(formattedResults);
  });
});


// 2. GET todos los usuarios con sus habilidades
app.get('/api/users', (req, res) => {
  const query = `
    SELECT u.userId, u.name, u.age, 
      GROUP_CONCAT(us.skill ORDER BY us.skill ASC) as skills
    FROM Users u
    JOIN UserSkills us ON u.userId = us.userId
    GROUP BY u.userId, u.name, u.age;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error('Error al ejecutar la consulta: ', error);
      res.status(500).send('Error al obtener los datos');
      return;
    }
    const formattedResults = results.map(row => {
      return {
        userId: row.userId,
        name: row.name,
        age: row.age,
        skills: row.skills ? row.skills.split(',') : []
      };
    });

    res.send(formattedResults);
  });
});

// 3. POST crear un nuevo usuario
app.post('/api/users', async (req, res) => {
  const { name, age, skills } = req.body;

  const connection = require('./config/database');

  connection.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        status: 500,
        errors: 'Error al iniciar la transacción',
        response: null
      });
    }

    try {
      const userInsertQuery = 'INSERT INTO Users (name, age) VALUES (?, ?)';
      const [result] = await connection.promise().query(userInsertQuery, [name, age]);

      const userId = result.insertId;

      const skillInsertQuery = 'INSERT INTO UserSkills (userId, skill) VALUES (?, ?)';

      for (const skill of skills) {
        await connection.promise().query(skillInsertQuery, [userId, skill]);
      }

      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({
              success: false,
              status: 500,
              errors: 'Error al confirmar la transacción',
              response: null
            });
          });
        }
        res.status(201).json({
          success: true,
          status: 201,
          errors: null,
          response: 'Usuario creado exitosamente'
        });
      });
    } catch (err) {
      connection.rollback(() => {
        console.error('Error al crear el usuario y sus habilidades: ', err);
        res.status(500).json({
          success: false,
          status: 500,
          errors: 'Error al crear el usuario',
          response: null
        });
      });
    }
  });
});

// 4. POST crear una nueva tarea
app.post('/api/tasks', async (req, res) => {
  const { title, date, completed, users } = req.body;
  const connection = require('./config/database');

  connection.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        status: 500,
        errors: 'Error al iniciar la transacción',
        response: null
      });
    }

    try {
      const userIds = [];
      for (const user of users) {
        const { name, age, skills } = user;
        const [existingUser] = await connection.promise().query('SELECT userId FROM Users WHERE name = ?', [name]);

        let userId;
        if (existingUser.length > 0) {
          userId = existingUser[0].userId;
        } else {
          const insertUserQuery = 'INSERT INTO Users (name, age) VALUES (?, ?)';
          const [result] = await connection.promise().query(insertUserQuery, [name, age]);
          userId = result.insertId;
          const insertSkillQuery = 'INSERT INTO UserSkills (userId, skill) VALUES (?, ?)';
          for (const skill of skills) {
            await connection.promise().query(insertSkillQuery, [userId, skill]);
          }
        }
        userIds.push(userId);
      }
      const taskInsertQuery = 'INSERT INTO Tasks (title, date, completed) VALUES (?, ?, ?)';
      const [taskResult] = await connection.promise().query(taskInsertQuery, [title, date, completed]);
      const taskId = taskResult.insertId;
      const taskUserInsertQuery = 'INSERT INTO TaskUsers (taskId, userId) VALUES (?, ?)';
      for (const userId of userIds) {
        await connection.promise().query(taskUserInsertQuery, [taskId, userId]);
      }
      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({
              success: false,
              status: 500,
              errors: 'Error al confirmar la transacción',
              response: null
            });
          });
        }
        res.status(201).json({
          success: true,
          status: 201,
          errors: null,
          response: 'Tarea creada exitosamente'
        });
      });
    } catch (err) {
      connection.rollback(() => {
        console.error('Error al crear la tarea y asignar usuarios: ', err);
        res.status(500).json({
          success: false,
          status: 500,
          errors: 'Error al crear la tarea',
          response: null
        });
      });
    }
  });
});

// 5. PUT actualizar un usuario
app.put('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { name, age, skills } = req.body;

  const connection = require('./config/database');

  connection.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        status: 500,
        errors: 'Error al iniciar la transacción',
        response: null
      });
    }

    try {
      const updateUserQuery = 'UPDATE Users SET name = ?, age = ? WHERE userId = ?';
      await connection.promise().query(updateUserQuery, [name, age, userId]);
      const deleteSkillsQuery = 'DELETE FROM UserSkills WHERE userId = ?';
      await connection.promise().query(deleteSkillsQuery, [userId]);
      const insertSkillQuery = 'INSERT INTO UserSkills (userId, skill) VALUES (?, ?)';
      for (const skill of skills) {
        await connection.promise().query(insertSkillQuery, [userId, skill]);
      }

      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({
              success: false,
              status: 500,
              errors: 'Error al confirmar la transacción',
              response: null
            });
          });
        }
        res.status(200).json({
          success: true,
          status: 200,
          errors: null,
          response: 'Usuario actualizado exitosamente'
        });
      });
    } catch (err) {
      connection.rollback(() => {
        res.status(500).json({
          success: false,
          status: 500,
          errors: 'Error al actualizar el usuario',
          response: null
        });
      });
    }
  });
});

// 6. PUT actualizar una tarea
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, date, completed, users } = req.body;

  const connection = require('./config/database');

  connection.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        status: 500,
        errors: 'Error al iniciar la transacción',
        response: null
      });
    }

    try {
      const userIds = [];
      for (const user of users) {
        const { name, age, skills } = user;
        const [existingUser] = await connection.promise().query('SELECT userId FROM Users WHERE name = ?', [name]);

        let userId;
        if (existingUser.length > 0) {
          userId = existingUser[0].userId;
        } else {
          const insertUserQuery = 'INSERT INTO Users (name, age) VALUES (?, ?)';
          const [result] = await connection.promise().query(insertUserQuery, [name, age]);
          userId = result.insertId;
          const insertSkillQuery = 'INSERT INTO UserSkills (userId, skill) VALUES (?, ?)';
          for (const skill of skills) {
            await connection.promise().query(insertSkillQuery, [userId, skill]);
          }
        }
        userIds.push(userId);
      }
      const formattedDate = new Date(date).toISOString().split('T')[0];
      const updateTaskQuery = 'UPDATE Tasks SET title = ?, date = ?, completed = ? WHERE id = ?';
      await connection.promise().query(updateTaskQuery, [title, formattedDate, completed, id]);
      const deleteTaskUsersQuery = 'DELETE FROM TaskUsers WHERE taskId = ?';
      await connection.promise().query(deleteTaskUsersQuery, [id]);
      const insertTaskUserQuery = 'INSERT INTO TaskUsers (taskId, userId) VALUES (?, ?)';
      for (const userId of userIds) {
        await connection.promise().query(insertTaskUserQuery, [id, userId]);
      }

      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({
              success: false,
              status: 500,
              errors: 'Error al confirmar la transacción',
              response: null
            });
          });
        }
        res.status(200).json({
          success: true,
          status: 200,
          errors: null,
          response: 'Tarea actualizada exitosamente'
        });
      });
    } catch (err) {
      connection.rollback(() => {
        console.error('Error al actualizar la tarea y asignar usuarios: ', err);
        res.status(500).json({
          success: false,
          status: 500,
          errors: 'Error al actualizar la tarea',
          response: null
        });
      });
    }
  });
});



// 7. DELETE eliminar un usuario
app.delete('/api/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const connection = require('./config/database');
  connection.beginTransaction(async (err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        status: 500,
        errors: 'Error al iniciar la transacción',
        response: null
      });
    }

    try {
      const deleteUserQuery = 'DELETE FROM Users WHERE userId = ?';
      await connection.promise().query(deleteUserQuery, [userId]);
      const deleteSkillsQuery = 'DELETE FROM UserSkills WHERE userId = ?';
      await connection.promise().query(deleteSkillsQuery, [userId]);
      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            res.status(500).json({
              success: false,
              status: 500,
              errors: 'Error al confirmar la transacción',
              response: null
            });
          });
        }
        res.status(200).json({
          success: true,
          status: 200,
          errors: null,
          response: 'Usuario eliminado exitosamente'
        });
      });
    } catch (err) {
      connection.rollback(() => {
        res.status(500).json({
          success: false,
          status: 500,
          errors: 'Error al eliminar el usuario',
          response: null
        });
      });
    }
  });
});

const port = 3000; // Puerto en el que el servidor escuchará las solicitudes

app.listen(port, () => {
  console.log(`Servidor escuchando en el puerto ${port}`);
});

