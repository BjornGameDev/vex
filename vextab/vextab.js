/**
 * @preserve
 * VexTab Parser - A recursive descent parser for the VexTab language.
 * Copyright Mohit Cheppudira 2010 <mohit@muthanna.com>
 *
 * Requires the VexFlow rendering API - vexflow.js from:
 *
 *   http://vexflow.com
 *
 * Learn all about the VexTab language at:
 *
 *   http://vexflow.com/tabdiv/tutorial.html
 *
 * This file is licensed under the MIT license:
 *
 *   http://www.opensource.org/licenses/mit-license.php
 */

/**
 * @constructor
 * @requires Vex.Flow This parser depends on the VexFlow rendering API.
 *
 * Initialize and return a new VexTab parser. Example usage:
 *
 *   var JUSTIFY_WIDTH = 400;
 *   var CONTEXT = new Vex.Flow.Renderer(
 *      document.getElementById("canvas_id"),
 *      Vex.Flow.Renderer.Backends.CANVAS).getContext();
 *
 *   var parser = new Vex.Flow.VexTab();
 *
 *   try {
 *     parser.parse(vextab_code);
 *     if (parser.isValid()) {
 *       var elements = parser.getElements();
 *
 *       for (var i = 0; i < staves.length; ++i) {
 *         var stave = elements.staves[i];
 *         var voice_notes = elements.notes[i];
 *         var voice_ties = elements.ties[i];
 *
 *         // Draw stave
 *         stave.setWidth(JUSTIFY_WIDTH);
 *         stave.setContext(CONTEXT).draw();
 *
 *         // Draw notes and modifiers.
 *         if (voice_notes) {
 *           Vex.Flow.Formatter.FormatAndDraw(CONTEXT, stave,
 *               voice_notes, JUSTIFY_WIDTH - 20);
 *         }
 *
 *         // Draw ties
 *         for (var j = 0; j < voice_ties.length; ++j) {
 *           voice_ties[j].setContext(CONTEXT).draw();
 *         }
 *       }
 *     }
 *   } catch (e) {
 *      console.log(e.message);
 *   }
 *
 */
Vex.Flow.VexTab = function() {
  this.init();
}

/**
 * Initialize VexTab.
 * @constructor
 */
Vex.Flow.VexTab.prototype.init = function() {
  // The VexFlow elements generated from the VexTab code.
  this.elements = {
    staves: [],
    notes: [],
    ties: []
  };

  // Pre-parser state. This is used for error-reporting and
  // element generation.
  this.state = {
    current_line: 0,
    current_stave: -1
  };

  this.valid = false;         // Valid (parseable) VexTab?
  this.last_error = "";       // Last error message generated.
  this.last_error_line = 0;   // Line number of last error.
  this.height = 0;            // Total height of generated elements.
}

/**
 * Returns true if the passed-in code parsed without errors.
 *
 * @return {Boolean} True if code is error-free.
 */
Vex.Flow.VexTab.prototype.isValid = function() { return this.valid; }

/**
 * Returns the generated VexFlow elements. Remember to call #isValid before
 * calling this method.
 *
 * @return {!Object} The generated VexFlow elements.
 */
Vex.Flow.VexTab.prototype.getElements = function() {
  return this.elements;
}

/**
 * @return {Number} The total height (in pixels) of the generated elements.
 */
Vex.Flow.VexTab.prototype.getHeight = function() { return this.height; }

/**
 * This method parses the VexTab code provided, and generates VexFlow
 * elements from it. The elements can be retrieved with the #getElements
 * method.
 *
 * If the parse fails, a Vex.RuntimeError of the type "ParseError" is
 * thrown with the line number and specific error message.
 *
 * Upon success, no exception is thrown and #isValid returns true.
 *
 * @param {String} code The VexTab code to parse.
 */
Vex.Flow.VexTab.prototype.parse = function(code) {
  // Clear elements and initialize parse state
  this.init();

  // Separate code into lines
  var lines = code.split("\n");
  for (var i = 0; i < lines.length; ++i) {
    var line = lines[i];
    this.state.current_line++;
    // Strip leading and trailing spaces
    line = line.replace(/(^\s*)|(\s*$)/gi,"");
    // Skip blank lines
    if (line == "") continue;

    // This line has entropy. Parse it.
    this.parseLine(line);
  }

  this.valid = true;
  this.height += 30;

  return this;
}

/**
 * Throws a Vex.RuntimeError exception with the code set to "ParseError". The
 * error includes the line number and specific error message.
 *
 * @param {String} message The error string.
 * @private
 */
Vex.Flow.VexTab.prototype.parseError = function(message) {
  this.valid = false;
  this.last_error = message;
  this.last_error_line = this.state.current_line;

  // Create and throw the RuntimeError exception.
  var error = new Vex.RERR("ParseError",
      "Line " + this.state.current_line + ": " + message);
  error.line = this.state.current_line;
  throw error;
}

/**
 * A line of VexTab code is essentially structured as:
 *
 *    command [param] [param] ...
 *
 * This function parses out valid commands and executes the
 * relevant sub-parser to work on the parameters.
 *
 * @param {String} line One line of VexTab code.
 * @private
 */
Vex.Flow.VexTab.prototype.parseLine = function(line) {
  // Split line into tokens
  var tokens = line.split(/\s+/);

  // The first token is the command. Run it.
  var command = tokens[0];
  switch(command) {
    // Generate a TAB stave.
    case "tabstave": this.genTabStave(tokens); break;

    // Parse tab notes.
    case "notes": this.parseNotes(tokens); break;

    // Unrecognized command. Throw an error.
    default: this.parseError("Invalid keyword: " + command);
  }
}

/**
 * VexTab notes consists of note-groups separated by spaces. For
 * example:
 *
 *   4-5-6/4 5 | (4/5.5/6.6.7)
 *
 * Each note group is parsed by a recursive-descent parser.
 *
 * @param {Array.<String>} tokens An array of note-groups.
 * @private
 */
Vex.Flow.VexTab.prototype.parseNotes = function(tokens) {
  for (var i = 1; i < tokens.length; ++i) {
    var token = tokens[i];
    switch (token) {
      // Bars are simple. No parsing necessary.
      case "|": this.genBar(); break;

      // Everything else goes through the recdescent toke parser.
      default:
        this.parseToken(tokens[i]);
        this.genElements();
    }
  }
}

/**
 * This method is a regular-expression based lexer. Its job is to:
 *
 *    1) Extract the next token.
 *    2) Strip out the remaining string.
 *    3) Keep track of errors (e.g., unexpected EOL, unrecognized token, etc.)
 *
 * The valid tokens are:
 *
 *    "t" - Taps (represented as Annotations in VexFlow)
 *    "s" - Slides (represented as Ties in VexFlow)
 *    "h" - Hammer-ons (represented as Ties in VexFlow)
 *    "p" - Pull-offs (represented as Ties in VexFlow)
 *    "b" - Bends
 *    "v" - Soft vibrato
 *    "V" - Harsh vibrato
 *    "-" - Fret separators
 *    "/" - String separator
 *    "(" - Open chord
 *    "." - Note separator inside a chord
 *    ")" - Close chord
 *    \d+ - A fret or string number
 *
 * @private
 */
Vex.Flow.VexTab.prototype.getNextToken = function() {
  if (this.parse_state.done)
    this.parseError("Unexpected end of line");

  var match = this.parse_state.str.match(/^(\d+|[\)\(-tbhpsvV\.\/\|])(.*)/);

  if (match) {
    this.parse_state.value = match[1];
    this.parse_state.str = match[2];
    if (this.parse_state.str == "") this.parse_state.done = true;
    return true;
  }

  this.parseError("Error parsing notes at: " + this.parse_state.str);
  return false;
}

/**
 * This is the start of the recdescent grammar for notes-lines. A notes-line
 * can begin with a "(", "t", or a fret number.
 *
 * @param {String} str A notes-line token.
 * @private
 */
Vex.Flow.VexTab.prototype.parseToken = function(str) {
  // Initialize the recursive descent parser state.
  this.parse_state = {
    str: str,                 // The leftover string to parse
    done: false,              // Finished parsing everything?
    expecting_string: false,  // Expecting a string number (as opposed to fret)

    // This keeps track of positions in time. A position can have multipe
    // string-fret combos (incase of chords), or just one.
    positions: [],
    position_index: -1,
    annotations: [],          // Annotations associated with positions
    bends: [],                // Bends associated with positions
    vibratos: [],             // Vibrations associated with positions
    ties: [],                 // Ties associated with positions

    inside_bend: false,       // Are we inside a bend
    chord_index: -1           // The current chord index
  };

  var done = false;
  while (!done && this.getNextToken()) {
    switch (this.parse_state.value) {
      case "(": this.parseOpenChord(); break;
      case "t": this.parseTapAnnotation(); break;
      default: this.parseFret();
    }

    done = this.parse_state.done;
  }
}

/**
 * Parse "(" - Start a chord.
 *
 * @private
 */
Vex.Flow.VexTab.prototype.parseOpenChord = function() {
  // Add a position for this chord.
  this.parse_state.positions.push([]);
  this.parse_state.position_index++;

  // Reset the chord-index.
  this.parse_state.chord_index = -1;

  // The next token must be a fret.
  this.getNextToken();
  this.parseChordFret();
}

/**
 * Parse "t" - Tap annotations.
 *
 * @private
 */
Vex.Flow.VexTab.prototype.parseTapAnnotation = function() {
  // Create an annotation and assosiate it with the note in the
  // next position.
  this.parse_state.annotations.push({
      position: this.parse_state.position_index + 1,
      text: "T" });

  // The next token must be a fret.
  this.getNextToken();
  this.parseFret();
}


/**
 * Parse one note in a chord. The note must have a fret and string, and
 * may contain a bend.
 *
 * @private
 */
Vex.Flow.VexTab.prototype.parseChordFret = function() {
  // Do we have a valid fret?
  var fret = this.parse_state.value;
  if (isNaN(parseInt(fret)))
    this.parseError("Invalid fret number: " + fret);

  // The next token can either be a bend or a slash
  this.getNextToken();
  if (this.parse_state.value == "b") {
    // This is a bend, parse it out.
    this.parseChordBend();
  } else if (this.parse_state.value != "/") {
    this.parseError("Expecting / for string number: " + this.parse_state.value);
  }

  // We found a slash, parse out the string number and make sure
  // it's valid.
  this.getNextToken();
  var str = parseInt(this.parse_state.value);
  if (isNaN(parseInt(str)))
    this.parseError("Invalid string number: " + this.parse_state.value);

  // Add current fret-string to current position. Don't create a new
  // position because this is a chord.
  this.parse_state.positions[this.parse_state.position_index].push(
      { fret: fret, str: str });
  this.parse_state.chord_index++;

  // Next token can either be a chord separator ".", or a close chord ")"
  this.getNextToken();
  switch(this.parse_state.value) {
    case ".": this.getNextToken(); this.parseChordFret(); break;
    case ")": this.parseCloseChord(); break;
    default: this.parseError("Unexpected token: " + this.parse_state.value);
  }
}

/**
 * Parse a close chord token ")".
 *
 * @private
 */
Vex.Flow.VexTab.prototype.parseCloseChord = function() {
  // Reset chord index.
  this.chord_index = -1;

  // This is a valid place for parsing to end.
  if (this.parse_state.done) return;

  // There are more tokens. The only legitimate next token can be a
  // vibrato.
  this.getNextToken();
  switch (this.parse_state.value) {
    case "v": this.parseVibrato(); break;
    case "V": this.parseVibrato(); break;
    default: this.parseError("Unexpected token: " + this.parse_state.value);
  }
}

/**
 * Parse bends inside chords.
 * @private
 */
Vex.Flow.VexTab.prototype.parseChordBend = function() {
  // Next token has to be a fret number.
  this.getNextToken();
  var fret = parseInt(this.parse_state.value);
  if (isNaN(fret)) this.parseError("Expecting fret: " + this.parse_state.value);

  // If we're already inside a bend, then mark this as a release, otherwise
  // create a new bend.
  if (this.parse_state.inside_bend) {
    var this_bend = this.parse_state.bends.length - 1;
    // We're actually incrementing a bend count here because we want to
    // be able to support multiple sequential bends on one string.
    this.parse_state.bends[this_bend].count++;
  } else {
    this.parse_state.inside_bend = true;
    this.parse_state.bends.push(
        { position: this.parse_state.position_index, count: 1,
          index: this.parse_state.chord_index + 1, to_fret: fret });
  }

  // Next token can either be another bend, or a slash. (Remember, we're inside
  // a chord, so we can't really do slides or hammer/pulloff unambiguously.)
  this.getNextToken();
  switch (this.parse_state.value) {
    case "b": this.parseChordBend(); break;
    case "/": break;
    default:
      this.parseError("Unexpected token: " + this.parse_state.value);
  }

  this.parse_state.inside_bend = false;
}

/**
 * Parse fret number (outside a chord context).
 * @private
 */
Vex.Flow.VexTab.prototype.parseFret = function() {
  // Fret number must be valid.
  var str = this.parse_state.value;
  if (isNaN(parseInt(str)))
    this.parseError("Invalid fret number: " + str);

  // Create a new position for this fret/string pair.
  this.parse_state.positions.push([{ fret: str }]);
  this.parse_state.position_index++;

  // Extract and parse next token.
  this.getNextToken();
  switch(this.parse_state.value) {
    case "-": this.parseDash(); break;
    case "/": this.parseSlash(); break;
    case "b": this.parseBend(); break;
    case "s": this.parseTie(); break;
    case "t": this.parseTie(); break;
    case "h": this.parseTie(); break;
    case "p": this.parseTie(); break;
    case "v": this.parseFretVibrato(); break;
    case "V": this.parseFretVibrato(); break;
    default: this.parseError("Unexpected token: " + this.parse_state.value);
  }
}

/**
 * Parse dashes.
 * @private
 */
Vex.Flow.VexTab.prototype.parseDash = function() {
  // Dashes break us out of bend contexts
  this.parse_state.inside_bend = false;

  // Dashes are not alloed on strings
  if (this.parse_state.expecting_string)
    this.parseError("No dashes on strings: " + this.parse_state.str);
}

/**
 * Parse vibratos.
 * @private
 */
Vex.Flow.VexTab.prototype.parseVibrato = function() {
  var harsh = false;

  // Capital V means harsh vibrato.
  if (this.parse_state.value == "V") harsh = true;

  var position = this.parse_state.position_index;
  if (this.parse_state.inside_bend) {
    // If we're inside a bend we associate the vibrato with the first
    // fret of the bend
    var count = this.parse_state.bends[this.parse_state.bends.length - 1].count;
    position -= count;
  }

  this.parse_state.vibratos.push({position: position, harsh: harsh});
}

/**
 * Parse vibratos inside a fret context.
 * @private
 */
Vex.Flow.VexTab.prototype.parseFretVibrato = function() {
  this.parseVibrato();
  this.getNextToken();
  switch(this.parse_state.value) {
    case "-": this.parseDash(); break;
    case "s": this.parseTie(); break;
    case "h": this.parseTie(); break;
    case "p": this.parseTie(); break;
    case "t": this.parseTie(); break;
    case "/": this.parseSlash(); break;
    default: this.parseError("Unexpected token: " + this.parse_state.value);
  }
}

/**
 * Parse string separator "/".
 * @private
 */
Vex.Flow.VexTab.prototype.parseSlash = function(str) {
  this.parse_state.inside_bend = false;
  this.parse_state.expecting_string = true;

  // Next token must be a string number
  this.getNextToken();
  this.parseString();
}

/**
 * Parse string number.
 * @private
 */
Vex.Flow.VexTab.prototype.parseString = function() {
  var str = this.parse_state.value;
  if (this.parse_state.positions.length == 0)
    this.parseError("String without frets: " + str);

  // Associate string with all positions in this note-group.
  for (var i = 0; i < this.parse_state.positions.length; ++i) {
    this.parse_state.positions[i][0].str = str;
  }
}

/**
 * Parse ties, hammerons, slides, etc.
 * @private
 */
Vex.Flow.VexTab.prototype.parseTie = function() {
  this.parse_state.inside_bend = false;
  if (this.parse_state.expecting_string)
    this.parseError("Unexpected token on string: " + this.parse_state.str);

  this.parse_state.ties.push({
    position: this.parse_state.position_index,
    index: this.parse_state.chord_index + 1,
    effect: this.parse_state.value.toUpperCase()
  });

  // Next token has to be a fret number.
  this.getNextToken();
  this.parseFret();
}


/**
 * Parse bends outside a chord context.
 * @private
 */
Vex.Flow.VexTab.prototype.parseBend = function() {
  if (this.parse_state.expecting_string)
    this.parseError("Unexpected token on string: " + this.parse_state.str);

  if (this.parse_state.inside_bend) {
    var this_bend = this.parse_state.bends.length - 1;
    this.parse_state.bends[this_bend].count++;
  } else {
    this.parse_state.inside_bend = true;
    this.parse_state.bends.push(
        { position: this.parse_state.position_index, count: 1, index: 0 });
  }

  // Next token must be a fret.
  this.getNextToken();
  this.parseFret();
}

/**
 * Generate VexFlow elements from current parser state. The elements can
 * be retrieved with #getElements.
 *
 * @private
 */
Vex.Flow.VexTab.prototype.genElements = function() {
  // If there's no Tab Stave, generate one.
  if (this.state.current_stave == -1) this.genTabStave();

  // Start by building notes.
  var positions = this.parse_state.positions;
  var notes = [];

  // Associate notes with relevant positions.
  for (var i = 0; i < positions.length; ++i) {
    var note = new Vex.Flow.TabNote({positions: positions[i], duration: "8"});
    notes.push({note: note, persist: true});
  }

  // Add bends.
  var bends = this.parse_state.bends;
  for (var i = 0; i < bends.length; ++i) {
    var bend = bends[i];
    var from_fret = parseInt(positions[bend.position][bend.index].fret);
    var to_fret;

    // Bent notes must not persist in position list.
    if (bends[i].to_fret) {
      to_fret = bends[i].to_fret;
    } else {
      to_fret = parseInt(positions[bend.position + 1][bend.index].fret);
      notes[bend.position + 1].persist = false;
    }

    var release = false;
    if (bend.count > 1) release = true;

    var bent_note = notes[bend.position].note;

    // Calculate bend amount and annotate appropriately.
    switch (to_fret - from_fret) {
      case 1: bent_note.addModifier(
                  new Vex.Flow.Bend("1/2", release), bend.index); break;
      case 2: bent_note.addModifier(
                  new Vex.Flow.Bend("Full", release), bend.index); break;
      case 3: bent_note.addModifier(
                  new Vex.Flow.Bend("1 1/2", release), bend.index); break;
      case 4: bent_note.addModifier(
                  new Vex.Flow.Bend("2 Steps", release), bend.index); break;
      default: bent_note.addModifier(
                  new Vex.Flow.Bend("Bend to" + to_fret, release), bend.index);
    }
  }

  // Add vibratos
  var vibratos = this.parse_state.vibratos;
  for (var i = 0; i < vibratos.length; ++i) {
    var vibrato = vibratos[i];
    notes[vibrato.position].note.addModifier(new Vex.Flow.Vibrato().
      setHarsh(vibrato.harsh));
  }

  // Add annotations
  var annotations = this.parse_state.annotations;
  for (var i = 0; i < annotations.length; ++i) {
    var annotation = annotations[i];
    notes[annotation.position].note.addModifier(
        new Vex.Flow.Annotation(annotation.text));
  }

  // Add ties
  var ties = this.parse_state.ties;
  for (var i = 0; i < ties.length; ++i) {
    var tie = ties[i];
    var effect;

    if (tie.effect == "S") {
      // Slides are a special case.
      effect = new Vex.Flow.TabSlide({
        first_note: notes[tie.position].note,
        last_note: notes[tie.position + 1].note
      });
    } else {
      effect = new Vex.Flow.TabTie({
        first_note: notes[tie.position].note,
        last_note: notes[tie.position + 1].note
      }, tie.effect);
    }

    this.elements.ties[this.state.current_stave].push(effect);
  }

  // Push notes, skipping non-persistant notes.
  for (var i = 0; i < notes.length; ++i) {
    var note = notes[i];
    if (note.persist)
      this.elements.notes[this.state.current_stave].push(note.note);
  }
}

/**
 * Generate the tab stave and add it to the element list.
 * @private
 */
Vex.Flow.VexTab.prototype.genTabStave = function(tokens) {
  var stave = new Vex.Flow.TabStave(20, this.height, 380).addTabGlyph();
  this.elements.staves.push(stave);
  this.height += stave.getHeight();
  this.state.current_stave++;
  this.elements.notes[this.state.current_stave] = [];
  this.elements.ties[this.state.current_stave] = [];
}

/**
 * Generate bar line ad add it to the element list.
 * @private
 */
Vex.Flow.VexTab.prototype.genBar = function() {
  // If there's no Tab Stave, generate one.
  if (this.state.current_stave == -1) this.genTabStave();
  this.elements.notes[this.state.current_stave].push(new Vex.Flow.BarNote());
}