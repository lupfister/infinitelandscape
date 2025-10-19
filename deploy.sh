#!/bin/bash

# Build the project
echo "Building project..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "Build successful!"
    echo "Your site is ready to be deployed."
    echo ""
    echo "For GitHub Pages:"
    echo "1. Push your changes to GitHub"
    echo "2. Go to Settings > Pages in your GitHub repo"
    echo "3. Select 'Deploy from a branch' and choose 'main'"
    echo "4. Your site will be available at: https://yourusername.github.io/infinitelandscape.js/"
    echo ""
    echo "For Vercel:"
    echo "1. Go to vercel.com"
    echo "2. Import your GitHub repository"
    echo "3. Deploy automatically!"
else
    echo "Build failed. Please check for errors."
    exit 1
fi
