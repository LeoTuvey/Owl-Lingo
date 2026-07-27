function lessonList(...titles) {
  return titles.map((title, index) => ({
    id: `lesson-${index + 1}`,
    title,
    type: index === titles.length - 1 ? "quiz" : "lesson"
  }));
}

function ball(id, number, title, summary, lessonCount) {
  return { id, number, title, summary, lessonCount };
}

const SECTION_ONE_PARTS = [
  {
    id: "part-1",
    number: 1,
    title: "🔤 Alphabets",
    summary: "Letters, sounds, and first symbols.",
    href: "game1.html?coursePart=alphabets&v=lessonpath2",
    icon: "🔤",
    accent: "gold",
    lessons: lessonList(
      "Kurmanji letters and Sorani matching",
      "Letter sounds and example names"
    ),
    balls: [
      ball("a-part-1a", 1, "Ball 1", "Alphabet, Sorani script, and letter sounds", 1)
    ]
  },
  {
    id: "part-2",
    number: 2,
    title: "👨‍👩‍👧‍👦 Describe Your Family",
    summary: "Family words, roles, and simple descriptions.",
    href: "game1.html?coursePart=family&v=lessonpath15",
    icon: "👨‍👩‍👧‍👦",
    accent: "orange",
    lessons: lessonList(
      "Family member matching",
      "Meaning and missing-word practice",
      "Write family words in English",
      "Listening and typing review",
      "Translate Kurmanji family sentences into English",
      "Translate English family sentences into Kurmanji",
      "Different types of uncles and aunts",
      "Different types of cousins",
      "Nieces and nephews",
      "Family groups",
      "Family groups review",
      "Match the Pairs review",
      "Match the Pairs",
      "Match the Pairs 2",
      "Subject Pronouns",
      "To Be",
      "Select the Correct Meaning",
      "Translate into Kurmanji",
      "Type the Correct English Sentence",
      "Put the Words in Order",
      "Family & Possessives",
      "Describing people and jobs",
      "Match the Pairs",
      "Match the Pairs",
      "Match the Pairs",
      "Select the Correct Meaning",
      "Write in English",
      "Possessive brothers",
      "Fill in the missing English word",
      "Write in English",
      "Write in English",
      "Write in English",
      "Pick the Correct Phrase",
      "Age words and life stages",
      "Is and are practice",
      "Siblings and parents",
      "Family sentence blanks",
      "Which sentence is correct",
      "In-laws matching",
      "Greeting words",
      "Simple greeting review",
      "Final Exam: Write in English",
      "Final Exam: Fill the sentence",
      "Final Exam: Fill in the Missing Word",
      "Final Exam: Arrange the English Words",
      "Final Exam: Fill in the Missing Words",
      "Final Exam: Which Sentence Is Correct?",
      "Final Exam: Select the Correct Meaning"
    ),
    balls: [
      ball("a-part-1b", 1, "Ball 1", "Family words and basic family practice", 4),
      ball("a-part-1c", 2, "Ball 2", "Family sentence translation and sentence building", 2),
      ball("a-part-1d-v3", 3, "Ball 3", "Extended family members, family groups, and quizzes", 6),
      ball("a-part-1e-v2", 4, "Ball 4", "Descriptions, pronouns, to be, and family possessives", 5),
      ball("a-part-1f-v1", 5, "Ball 5", "Translation, possessives, and describing people", 5),
      ball("a-part-1g-v1", 6, "Ball 6", "Traits, animals, and writing family descriptions", 5),
      ball("a-part-1h-v1", 7, "Ball 7", "Possessives, writing practice, and correct phrases", 5),
      ball("a-part-1i-v1", 8, "Ball 8", "Age words, is/are practice, and correct phrases", 8),
      {
        id: "a-part-1j-final",
        number: 9,
        title: "Ball 9",
        summary: "Final Exam of Describe Your Family",
        lessonCount: 7,
        icon: "🏆"
      }
    ]
  },
  {
    id: "part-3",
    number: 3,
    title: "👋 Greet People",
    summary: "Greetings, introductions, and polite phrases.",
    href: "game1.html?coursePart=greetings&v=lessonpath29",
    icon: "👋",
    accent: "sky",
    lessons: lessonList(
      "Subject Pronouns",
      "Times of the Day",
      "Basic Greetings",
      "Basic Conversation Words",
      "I",
      "He",
      "You (s.)",
      "You (p.)",
      "Tu and Hûn endings",
      "So, you, and thanks",
      "Go, have, yes, how, and home",
      "Go home and how are you",
      "Susan greeting conversation",
      "Nina and Adam greeting conversation",
      "To be ending note",
      "Plural greeting conversation",
      "We are good conversation",
      "Kurmanji typing practice",
      "Greeting word review",
      "Listen and choose",
      "Verb note",
      ...Array.from({ length:77 }, (_, index) => `Ball 3 activity ${index + 1}`)
    ),
    balls: [
      ball("a-part-2-greetings-v1", 1, "Ball 1", "Subject pronouns, times of day, greetings, and basic conversation", 9),
      ball("a-part-2-greetings-v2", 2, "Ball 2", "Greeting conversations, grammar endings, typing, and listening", 11),
      ball("a-part-2-greetings-v5", 3, "Ball 3", "Verb note, animals, have got, possessives, and articles", 78)
    ]
  },
  {
    id: "part-4",
    number: 4,
    title: "🍎 Talk About Food and Drink",
    summary: "Everyday food, drinks, and simple choices.",
    href: "game1.html?coursePart=food-drink&v=lessonpath2",
    icon: "🍎",
    accent: "pink",
    lessons: lessonList(
      "Daily food and drink words",
      "Meaning and review practice",
      "Simple phrases",
      "Listening and matching",
      "Yes and no basics",
      "Short review quiz",
      "Final meaning review",
      "Sentence building and wrap-up"
    ),
    balls: [
      ball("b-part-1", 1, "Ball 1", "Drinks, food, and welcome words", 2),
      ball("b-part-2", 2, "Ball 2", "Phrases, listening, and matching", 2),
      ball("b-part-3", 3, "Ball 3", "Yes, no, and review practice", 2),
      ball("b-part-4", 4, "Ball 4", "Final review and sentence building", 2)
    ]
  },
  {
    id: "part-5",
    number: 5,
    title: "💼 Describe Your Job",
    summary: "Work, roles, and describing what people do.",
    icon: "💼",
    accent: "violet",
    lessons: [],
    balls: []
  },
  {
    id: "part-6",
    number: 6,
    title: "🎒 Talk About Possessions",
    summary: "Ownership, items, and who has what.",
    href: "game1.html?coursePart=possessions&v=lessonpath2",
    icon: "🎒",
    accent: "leaf",
    lessons: lessonList(
      "Book vocabulary",
      "Book sentence review",
      "Ball vocabulary",
      "Ball sentence review",
      "House vocabulary",
      "House sentence review"
    ),
    balls: [
      ball("d-part-1", 1, "Ball 1", "Book lesson", 2),
      ball("d-part-2", 2, "Ball 2", "Ball lesson", 2),
      ball("d-part-3", 3, "Ball 3", "House lesson", 2)
    ]
  },
  {
    id: "part-7",
    number: 7,
    title: "⚽ Discuss Hobbies",
    summary: "Free time, likes, and fun activities.",
    icon: "⚽",
    accent: "gold",
    lessons: [],
    balls: []
  },
  {
    id: "part-8",
    number: 8,
    title: "🐶 Describe Animals",
    summary: "Animal names and basic descriptions.",
    href: "game1.html?coursePart=animals&v=lessonpath2",
    icon: "🐶",
    accent: "orange",
    lessons: lessonList(
      "Person meaning practice",
      "Person missing-word review",
      "Kes meaning practice",
      "Kes missing-word review",
      "Man meaning practice",
      "Man missing-word review",
      "Woman meaning practice",
      "Woman missing-word review",
      "Boy meaning practice",
      "Boy missing-word review",
      "Girl meaning practice",
      "Girl missing-word review",
      "Cat meaning practice",
      "Cat missing-word review",
      "Dog meaning practice",
      "Dog missing-word review"
    ),
    balls: [
      ball("e-part-1", 1, "Ball 1", "Person lesson", 2),
      ball("e-part-2", 2, "Ball 2", "Kes lesson", 2),
      ball("e-part-3", 3, "Ball 3", "Man lesson", 2),
      ball("e-part-4", 4, "Ball 4", "Woman lesson", 2),
      ball("e-part-5", 5, "Ball 5", "Boy lesson", 2),
      ball("e-part-6", 6, "Ball 6", "Girl lesson", 2),
      ball("e-part-7", 7, "Ball 7", "Cat lesson", 2),
      ball("e-part-8", 8, "Ball 8", "Dog lesson", 2)
    ]
  },
  {
    id: "part-9",
    number: 9,
    title: "❓ Form Questions",
    summary: "Question words, patterns, and review.",
    href: "game1.html?coursePart=questions&v=lessonpath2",
    icon: "❓",
    accent: "sky",
    lessons: lessonList(
      "This, that, these, and those",
      "This, that, these, and those in English",
      "Kurmanji noun forms",
      "Apple and apples review",
      "This, that, these, and those with colors",
      "Ev and Ew with color sentences",
      "Is and are endings",
      "English is and are review",
      "True or false sentence check",
      "Pair matching",
      "Listening challenge",
      "Match the meaning",
      "Fill in the missing word",
      "Boss level review"
    ),
    balls: [
      ball("f-part-1", 1, "Ball 1", "This, that, these, and those", 4),
      ball("f-part-2a", 2, "Ball 2", "Color sentences, endings, and true-or-false review", 5),
      ball("f-part-2b", 3, "Ball 3", "Pair matching and listening challenge", 2),
      ball("f-part-3", 4, "Ball 4", "Question review and boss level", 3)
    ]
  },
  {
    id: "part-10",
    number: 10,
    title: "🏆 Final Exam of the Section",
    summary: "A final checkpoint for everything learned in Section 1.",
    icon: "🏆",
    accent: "violet",
    lessons: [],
    balls: []
  }
];

const COURSE_DATA = {
  id: "kurmanji-english-course",
  title: "Kurmanji to English",
  totalSections: 15,
  structure: ["Course", "Section", "Part", "Lesson", "Activity", "Quiz", "Review"],
  sections: Array.from({ length: 15 }, (_, index) => {
    const number = index + 1;

    if (number === 1) {
      return {
        id: "section-1",
        number,
        title: "Section 1",
        subtitle: "Foundations",
        summary: "A gentle first journey through beginner Kurmanji.",
        placeholder: false,
        parts: SECTION_ONE_PARTS
      };
    }

    return {
      id: `section-${number}`,
      number,
      title: `Section ${number}`,
      subtitle: "Coming Soon",
      summary: "This section is already on the course map and will unlock later.",
      placeholder: true,
      parts: []
    };
  })
};

window.COURSE_DATA = COURSE_DATA;
