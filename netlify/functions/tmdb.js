const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const path = event.queryStringParameters.path;
  if (!path) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing path parameter' }) };
  }

  const url = `https://api.themoviedb.org/3${path}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${process.env.TMDB_READ_TOKEN}`,
        'accept': 'application/json'
      }
    });
    
    const data = await res.json();
    return { 
      statusCode: res.status, 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type'
      }, 
      body: JSON.stringify(data) 
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};