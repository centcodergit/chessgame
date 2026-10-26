Chessgame, play with your friends or with an engine! Finally out, let's goooo!
<img width="1377" height="981" alt="Screenshot 2026-10-26 at 10 32 11 PM" src="https://github.com/user-attachments/assets/f2aa9630-e6c4-48e6-91a9-8bde0d3b700f" />

It is a chess game that runs in your browser, where you play against a small computer opponent or your friend on any theme you choose (there are 3)


Play it here: https://centcodergit.github.io/chessgame/

Start

Open the link above and click a piece. That's it.

If you'd rather run it off your own computer, there's nothing to install. Download the folder and double-click index.html.

What it does

- You play white, the computer plays black. Click a piece to see dots on every square it can legally go to (if it doesn't move then you probably did something wrong, like an illegal move).
- Five difficulty levels, going from stupid up to slowest. Honestly stupid mode is pretty bad, and slowest is really good
- Click any move in the log on the right to rewind the game to that point. There's also an undo button for when you hang your queen, lol.
- swap flips sides with the computer. You can also set both players to computer and just watch it play itself, which is weirdly relaxing.
- Three board themes: neon (the default, my favourite), *lassic grey, and wood. It remembers which one you picked.
- All the rules exist, like astling, en passant, promotion (you choose the piece), stalemate, and draw offers when the position is going nowhere.
- Works on a phone. Rotate it and the layout switches between board beside log and board above log.

If you want to run it locally, just download the files and press on the index.html to open it!

How it works

The board is a layout of 120 numbers instead of 64.

The computer picks its move with alpha-beta search. Basically it imagines a few moves ahead for both sides and skips any branch that is clearly worse than something it already found. The difficulty setting just changes how many moves deep it looks. That's why "slowest" actually is slow: every extra level of depth multiplies the work the engine has to do

It also adjusts what it cares about as the game goes on. Early on it gets rewarded for developing pieces. Later the king is encouraged to walk toward the centre, and if it thinks a draw is coming (lots of repeated positions or no captures for a long time) it changes how much it values a stalemate depending on who's ahead.

The search runs on the main thread, which is the one thing I'd change next. On the highest levels the page can freeze for a second while it thinks. Moving it into a Web Worker would fix that. If I have time for the project, I will do that!

engine.js is the chess logic and the actual engine, display.js draws the board and the buttons, and index.html handles the layout, resizing and themes.


HOPE YOU ENJOY :)

- CENTCODER
