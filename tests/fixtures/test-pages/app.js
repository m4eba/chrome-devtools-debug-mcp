// Test script for debugging tests

function greet(name) {
  const message = `Hello, ${name}!`;
  console.log(message);
  return message;
}

function calculateSum(a, b) {
  const result = a + b;
  return result;
}

function fetchData() {
  return fetch('/api/data')
    .then(response => response.json())
    .then(data => {
      console.log('Received data:', data);
      document.getElementById('output').textContent = JSON.stringify(data);
      return data;
    })
    .catch(error => {
      console.error('Fetch error:', error);
      throw error;
    });
}

function throwError() {
  throw new Error('Test error');
}

function asyncFunction() {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('Async complete');
      resolve('done');
    }, 100);
  });
}

// Event listener for button
document.getElementById('trigger').addEventListener('click', function() {
  console.log('Button clicked');
  greet('World');
  fetchData();
});

// Initialize
console.log('App loaded');
