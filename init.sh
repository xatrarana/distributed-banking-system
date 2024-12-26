#!/bin/bash

# Check for the -p flag and its argument
while getopts "p:" flag; do
    case "${flag}" in
        p) project_path=${OPTARG} ;;
        *) 
            echo "Usage: $0 -p <path>"
            exit 1
            ;;
    esac
done

# Ensure the project path is provided
if [ -z "$project_path" ]; then
    echo "Error: Path not provided. Use -p to specify the path."
    echo "Usage: $0 -p <path>"
    exit 1
fi

# Navigate to the specified path
if cd "$project_path" 2>/dev/null; then
    echo "Navigated to $project_path"
else
    echo "Error: Cannot navigate to $project_path. Make sure the directory exists."
    exit 1
fi

# Run the commands
echo "Initializing Node.js project..."
npm init -y

echo "Installing dependencies..."
npm i express jsonwebtoken ioredis

echo "Installing development dependencies..."
npm i prisma --save-dev

echo "Initializing Prisma..."
npx prisma init

echo "All commands executed successfully!"
