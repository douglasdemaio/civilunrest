#!/bin/bash

csv_file="USA.csv"
template="USA.svg"

mkdir -p output

tail -n +2 "$csv_file" | while IFS=',' read -r name; do
  sanitized=$(echo "$name" | tr -cd '[:alnum:]_-')
  output_svg="output/${sanitized}.svg"
  output_png="output/${sanitized}.png"

  sed "s/{{name}}/$name/g" "$template" > "$output_svg"

  inkscape "$output_svg" --export-type=png --export-filename="$output_png"
done
