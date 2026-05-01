## READ THE ENTIRE FILE BEFORE BEGINNING PLAN CREATION.

### Overview

I'm selecting option 3 from options.md.

I have exported my library, but do not read it. I repeat: Do not read the library file; It contains over 32000 songs plus numerous playlists and reading it will waste tokens on context.

Instead, I have exported the important details about the file structure and included them in this prompt.

The Library is in the Apple plist XML format.

The library file is named as a date value to allow me to easily identify future exports.

Based on my current library, the set of potential keys in a track list are noted in the references section at the end of this prompt file.

### Task Description

Create a plan to implement a system step by step to parse and load the library file contents into a database.

The plan should be output to implementation-plan.md.

The database should be able to store sync run history, track information as well as playlists.

There should be a playlist - track bridge table that can be used to indicate which tracks appear on which playlists, allowing the playlists and tracks tables to be specific only to the object, and not the ownership relationship, an easily allowing a many-to-many relationship between playlists and tracks as well as creating an easy process to update playlist changes.

The system should be able to accept a file in the future, and sync the databases accordingly.

The system should be able to output a report file in markdown following each run.

The report should contain json files to augment with structured data where reasonable. This will allow potential analysis on runs more easily.

The system should be able to identify when a new playlist or track object has a key that is not accounted for in the db schema and:

- Output the details in the report
- Provide a plan for patching the db with the missing schema details
- Generate a patch file for the mismatched data that can be used for reprocessing once the db patch has been executed

For this step in the process, we are not creating a UI, so include a driver script outside of the api that can be used from the terminal to easily query the databases and audit data as needed.

Include any other suggestions based on this initial plan that seem relevant and benificial.

### Tech Stack

- Backend: Node.js, Typescript, Express.js
- Database: SQLite, Knex.js

### References:

Track Keys:

```
Album
Album Artist
Apple Music
Artist
Artwork Count
Bit Rate
Clean
Compilation
Composer
Date Added
Date Modified
Disc Count
Disc Number
Disliked
Explicit
Favorited
File Folder Count
Genre
Grouping
HD
Has Video
Kind
Library Folder Count
Location
Loved
Movement Count
Movement Name
Movement Number
Music Video
Name
Normalization
Part Of Gapless Album
Persistent ID
Play Count
Play Date
Play Date UTC
Playlist Only
Purchased
Release Date
Sample Rate
Size
Skip Count
Skip Date
Sort Album
Sort Album Artist
Sort Artist
Sort Composer
Sort Name
Total Time
Track Count
Track ID
Track Number
Track Type
Work
Year
```
