import pygame
import sys
import random
import requests
import json
from datetime import datetime
import threading
import os

# Base directory of the script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ASSETS_DIR = os.path.join(BASE_DIR, '..', 'assets')
DATA_DIR = os.path.join(BASE_DIR, '..', 'data')



JSONBIN_API_KEY = "platzhalter"
BIN_ID = "platzhalter"
JSONBIN_URL = f"https://api.jsonbin.io/v3/b/{BIN_ID}"

# Initialisierung
pygame.init()

# Bildschirmparameter
WIDTH, HEIGHT = 500, 800
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Run-It")

# Farben
WHITE = (255, 255, 255)
BROWN = (139, 69, 19)
BLACK = (0, 0, 0)
GOLD = (255, 215, 0)
SILVER = (192, 192, 192)
BRONZE = (205, 127, 50)
GREEN = (100, 255, 100)

# FPS und Clock
FPS = 60
clock = pygame.time.Clock()

# Kombiniertes Highscore-System
player_name = ""
personal_highscore = 0
global_highscores = []  # Top 10 aller Spieler
entering_name = False
show_highscore_screen = False
first_death = True
current_score = 0
data_loading = False


def calculate_score(coins, time_survived, jumps):
    """Berechnet den Gesamtscore"""
    base_score = int(time_survived * 10)  # 10 Punkte pro Sekunde
    coin_bonus = coins * 10  # 10 Punkte pro Münze
    efficiency_bonus = int((coins * 50) / max(jumps, 1))  # Bonus für effiziientes Spielen
    return base_score + coin_bonus + efficiency_bonus


def load_all_data():
    """Lädt sowohl persönlichen Highscore als auch globale Rankings"""
    global personal_highscore, global_highscores, data_loading

    def fetch_data():
        global personal_highscore, global_highscores, data_loading
        try:
            headers = {'X-Master-Key': JSONBIN_API_KEY}
            response = requests.get(JSONBIN_URL, headers=headers, timeout=5)

            if response.status_code == 200:
                data = response.json()
                record = data.get('record', {})

                # Persönlichen Highscore laden
                personal_highscore = record.get('personal_highscore', 0)

                # Globale Top-10 laden und verarbeiten
                all_entries = record.get('global_rankings', [])

                # Gruppiere nach Spielernamen und behalte nur den höchsten Score pro Spieler
                player_best_scores = {}
                for entry in all_entries:
                    player = entry['name']
                    score = entry['score']
                    if player not in player_best_scores or score > player_best_scores[player]['score']:
                        player_best_scores[player] = entry

                # Konvertiere zurück zu Liste und sortiere
                global_highscores = list(player_best_scores.values())
                global_highscores.sort(key=lambda x: x['score'], reverse=True)
                global_highscores = global_highscores[:10]  # Top 10

                print(f"Daten geladen - Personal: {personal_highscore}, Global: {len(global_highscores)} Einträge")
            else:
                print(f"Fehler beim Laden: {response.status_code}")
        except Exception as e:
            print(f"Laden fehlgeschlagen: {e}")
        finally:
            data_loading = False

    data_loading = True
    thread = threading.Thread(target=fetch_data)
    thread.daemon = True
    thread.start()


def save_score_data(score):
    """Speichert sowohl persönlichen Highscore als auch globale Rankings"""
    global personal_highscore, global_highscores

    def upload_data():
        global personal_highscore, global_highscores
        try:
            # Neuen globalen Eintrag erstellen
            new_entry = {
                'name': player_name,
                'score': score,
                'coins': coins_collected,
                'time': round(timer, 1),
                'jumps': jumps,
                'date': datetime.now().strftime('%Y-%m-%d %H:%M')
            }

            # Zu globalen Rankings hinzufügen
            updated_global = global_highscores + [new_entry]

            # Gruppiere nach Spielernamen und behalte nur den höchsten Score pro Spieler
            player_best_scores = {}
            for entry in updated_global:
                player = entry['name']
                entry_score = entry['score']
                if player not in player_best_scores or entry_score > player_best_scores[player]['score']:
                    player_best_scores[player] = entry

            # Konvertiere zurück zu Liste, sortiere und behalte Top 10
            updated_global = list(player_best_scores.values())
            updated_global.sort(key=lambda x: x['score'], reverse=True)
            updated_global = updated_global[:10]  # Top 10 behalten

            # Persönlichen Highscore aktualisieren
            new_personal = max(personal_highscore, score)

            # Daten zusammenbauen
            data = {
                'player_name': player_name,
                'personal_highscore': new_personal,
                'global_rankings': updated_global,
                'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M')
            }

            headers = {'X-Master-Key': JSONBIN_API_KEY, 'Content-Type': 'application/json'}
            response = requests.put(JSONBIN_URL, json=data, headers=headers, timeout=10)

            if response.status_code == 200:
                personal_highscore = new_personal
                global_highscores = updated_global
                print(f"Daten gespeichert - Personal: {new_personal}, Global: {len(updated_global)} Einträge")
            else:
                print(f"Speichern fehlgeschlagen: {response.status_code}")
        except Exception as e:
            print(f"Speichern fehlgeschlagen: {e}")

    thread = threading.Thread(target=upload_data)
    thread.daemon = True
    thread.start()


def draw_name_input():
    """Name-Eingabe Interface (Leertaste deaktiviert für Eingabe)"""
    overlay = pygame.Surface((WIDTH, HEIGHT))
    overlay.set_alpha(200)
    overlay.fill(BLACK)
    screen.blit(overlay, (0, 0))

    font = pygame.font.Font('freesansbold.ttf', 32)
    small_font = pygame.font.Font('freesansbold.ttf', 20)

    # Titel
    title = font.render("ENTER YOUR NAME", True, GOLD)
    screen.blit(title, (WIDTH // 2 - title.get_width() // 2, HEIGHT // 2 - 100))

    # Name mit Cursor (keine Leerzeichen anzeigen)
    display_name = player_name.replace(" ", "")  # Leerzeichen entfernen für Anzeige
    name_display = display_name + "_" if len(display_name) < 15 else display_name
    name_surface = font.render(name_display, True, WHITE)
    screen.blit(name_surface, (WIDTH // 2 - name_surface.get_width() // 2, HEIGHT // 2 - 20))

    # Anweisungen
    if len(display_name) >= 2:
        instruction = small_font.render("Press SPACE or ENTER to confirm", True, WHITE)
        screen.blit(instruction, (WIDTH // 2 - instruction.get_width() // 2, HEIGHT // 2 + 40))
    else:
        instruction = small_font.render("2 or more characters required", True, WHITE)
        screen.blit(instruction, (WIDTH // 2 - instruction.get_width() // 2, HEIGHT // 2 + 40))


def draw_combined_death_screen():
    """Zeigt persönlichen Score und globale Rankings zusammen"""
    overlay = pygame.Surface((WIDTH, HEIGHT))
    overlay.set_alpha(200)
    overlay.fill(BLACK)
    screen.blit(overlay, (0, 0))

    big_font = pygame.font.Font('freesansbold.ttf', 40)
    font = pygame.font.Font('freesansbold.ttf', 24)
    small_font = pygame.font.Font('freesansbold.ttf', 18)

    # Game Over
    game_over_text = big_font.render("GAME OVER", True, WHITE)
    screen.blit(game_over_text, (WIDTH // 2 - game_over_text.get_width() // 2, 20))

    # Aktueller Score
    current_text = font.render(f"Your Score: {current_score}", True, WHITE)
    screen.blit(current_text, (WIDTH // 2 - current_text.get_width() // 2, 80))

    # Persönlicher Highscore
    if current_score > personal_highscore:
        highscore_text = font.render("NEW PERSONAL BEST!", True, GOLD)
        screen.blit(highscore_text, (WIDTH // 2 - highscore_text.get_width() // 2, 110))
        best_text = small_font.render(f"Previous Best: {personal_highscore}", True, WHITE)
        screen.blit(best_text, (WIDTH // 2 - best_text.get_width() // 2, 140))
    else:
        best_text = font.render(f"Personal Best: {personal_highscore}", True, GOLD)
        screen.blit(best_text, (WIDTH // 2 - best_text.get_width() // 2, 110))

    # Trennlinie
    pygame.draw.line(screen, WHITE, (50, 180), (WIDTH - 50, 180), 2)

    # Global Rankings Titel
    global_title = font.render("GLOBAL TOP 10", True, GOLD)
    screen.blit(global_title, (WIDTH // 2 - global_title.get_width() // 2, 190))

    if data_loading:
        loading_text = small_font.render("Loading global rankings...", True, WHITE)
        screen.blit(loading_text, (WIDTH // 2 - loading_text.get_width() // 2, 230))
    elif not global_highscores:
        no_data_text = small_font.render("No global rankings yet", True, WHITE)
        screen.blit(no_data_text, (WIDTH // 2 - no_data_text.get_width() // 2, 230))
    else:
        # Global Rankings anzeigen (vereinfacht ohne Details)
        y_offset = 230
        max_entries = min(10, len(global_highscores))  # Maximal 10 Einträge anzeigen

        for i in range(max_entries):
            entry = global_highscores[i]

            # Platzierung-Farbe
            if i == 0:
                color = GOLD
            elif i == 1:
                color = SILVER
            elif i == 2:
                color = BRONZE
            else:
                color = WHITE

            # Highlight wenn eigener Eintrag
            if entry['name'] == player_name:
                color = GREEN

            # Vereinfachte Darstellung: Nur Rang | Name | Score
            rank_text = f"{i + 1}."
            name_text = entry['name'][:12]  # Namen etwas länger lassen
            score_text = f"{entry['score']}"

            # Alles in einer Zeile
            main_line = f"{rank_text} {name_text} - {score_text}"
            main_surface = small_font.render(main_line, True, color)
            screen.blit(main_surface, (50, y_offset))

            y_offset += 30  # Weniger Abstand zwischen Einträgen

            if y_offset > HEIGHT - 120:  # Platz für Anweisungen lassen
                break

    # Spieler Name
    name_text = small_font.render(f"Player: {player_name}", True, WHITE)
    screen.blit(name_text, (WIDTH // 2 - name_text.get_width() // 2, HEIGHT - 80))

    # Anweisungen
    instruction = small_font.render("Press SPACE to play again", True, WHITE)
    screen.blit(instruction, (WIDTH // 2 - instruction.get_width() // 2, HEIGHT - 50))


# Hilfsfunktion: Laden und Skalieren eines Bildes
def load_scaled_image(path, scale):
    image = pygame.image.load(os.path.join(ASSETS_DIR, 'images', path))
    return pygame.transform.scale(image, (image.get_width() * scale, image.get_height() * scale))


# Globale Geschwindigkeitsvariable
game_speed = 6.0

# Boden Bewegend (Boden)
boden_image = load_scaled_image('boden.png', 3)

# Spielfigur
player_image_down = load_scaled_image('Figur_12x14.png', 4)
player_image_up = load_scaled_image('Figur_12x14_reverse.png', 4)
player_size = player_image_down.get_rect().size
player_pos = [50, HEIGHT - player_size[1] - 40]
current_image = player_image_down
movement_speed = 0.001
acceleration = 7

# Münze
coin_image = load_scaled_image('Münze 1.png', 3)
coin_size = coin_image.get_rect().size[0]
coin = None
spawn_timer_coin = 0
spawn_interval_coin = 150

# ===== CLOCK POWER-UP SYSTEM =====
# Uhr 1 (Good - Slow Time)
uhr_image = load_scaled_image('Uhr.png', 3)
uhr_size = uhr_image.get_rect().size[0]
uhr = None
spawn_timer_uhr = 0
spawn_interval_uhr = random.randint(30 * FPS, 60 * FPS)  # 30-60 seconds

# Uhr 2 (Bad - Fast Time)
uhr2_image = load_scaled_image('Uhr2.png', 3)
uhr2_size = uhr2_image.get_rect().size[0]
uhr2 = None
spawn_timer_uhr2 = 0
spawn_interval_uhr2 = random.randint(30 * FPS, 60 * FPS)  # 30-60 seconds

# Clock Power-up System Variables
clock_active = False
clock2_active = False
clock_timer = 0
clock2_timer = 0
clock_duration = 10.0  # 10 seconds effect duration
clock_spawn_cooldown = 0  # Prevents both clocks spawning at same time

# Physics modification variables
original_movement_speed = 0.6
original_acceleration = 7
current_movement_speed = 0.6
current_acceleration = 7

# Physics states
physics_modified = False
pending_physics_reset = False
modified_physics_type = None  # 'slow' or 'fast'

# Hindernis (Spikes)
spike_image = load_scaled_image('Spike 16x12.png', 3)
spike_image_reverse = load_scaled_image('Spike 16x12_reverse.png', 3)
spike_size = spike_image.get_rect().size[0]
spikes = []  # Mehrere Spikes
spawn_timer_spike = 0
min_spawn_interval_spike = int(0.25 * FPS)  # Mindestabstand in Frames (0,25 Sekunden)
spawn_interval_spike = min_spawn_interval_spike * 3

# Erweiterte Spike-Spawn-Variablen
last_spike_positions = []  # Speichert die letzten Spike-Positionen
consecutive_same_position = 0  # Zählt aufeinanderfolgende Spikes an gleicher Position
spike_patterns = [
    "single_top",  # Einzelner Spike oben
    "single_bottom",  # Einzelner Spike unten
    "alternating",  # Abwechselnd oben/unten
    "gap_top",  # Lücke oben (Spike unten)
    "gap_bottom",  # Lücke unten (Spike oben)
    "double_gap",  # Zwei Spikes mit Lücke
    "safe_zone"  # Keine Spikes (Erholung)
]
current_pattern = None
pattern_progress = 0
pattern_length = 0

# Punkte, Timer und Sprünge
timer = 0
coins_collected = 0
jumps = 0
game_paused = False

# Schriftart
font = pygame.font.Font('freesansbold.ttf', 24)
game_over_font = pygame.font.Font('freesansbold.ttf', 48)

# Flags für Bewegung
is_moving_up = False
is_moving_down = False
destination_pos = HEIGHT - player_size[1] - 40
air_jump_used = False

# Spielstatus
game_over = False

# Bodenbewegung
boden_positions = []  # Positionen für den Boden
boden_image_width = boden_image.get_width()

# Initialisiere die Bodenpositionen, sodass sie den gesamten Bildschirm abdecken
for i in range((WIDTH // boden_image_width) + 2):
    boden_positions.append(i * boden_image_width)

# Deckenbewegung (spiegelverkehrt)
decke_positions = boden_positions.copy()


# ===== CLOCK POWER-UP FUNCTIONS =====

def apply_clock_physics(clock_type):
    """Apply physics modifications based on clock type"""
    global current_movement_speed, current_acceleration, physics_modified, modified_physics_type

    if clock_type == 'slow':
        # Clock 1: Slower, more controllable movement
        current_movement_speed = original_movement_speed * 0.5  # 50% slower
        current_acceleration = original_acceleration * 0.4  # 60% less acceleration
        modified_physics_type = 'slow'
    elif clock_type == 'fast':
        # Clock 2: Faster, chaotic movement
        current_movement_speed = original_movement_speed * 1.8  # 80% faster
        current_acceleration = original_acceleration * 2.5  # 150% more acceleration
        modified_physics_type = 'fast'

    physics_modified = True


def reset_physics():
    """Reset physics to normal values"""
    global current_movement_speed, current_acceleration, physics_modified
    global pending_physics_reset, modified_physics_type

    current_movement_speed = original_movement_speed
    current_acceleration = original_acceleration
    physics_modified = False
    pending_physics_reset = False
    modified_physics_type = None


def is_player_grounded():
    """Check if player is on ground (top or bottom)"""
    return (player_pos[1] == HEIGHT - player_size[1] - 40 or
            player_pos[1] == 40) and not is_moving_up and not is_moving_down


def spawn_clock_powerup():
    """Spawn Clock 1 (good) powerup"""
    global uhr, spawn_timer_uhr, spawn_interval_uhr, clock_spawn_cooldown

    if not uhr and clock_spawn_cooldown <= 0:
        # Choose random position (top or bottom)
        potential_pos = [WIDTH, random.choice([60, HEIGHT - uhr_size - 60])]

        # Check for conflicts with spikes
        conflict = False
        for spike in spikes:
            if (abs(spike["position"][0] - potential_pos[0]) < 200 and
                    abs(spike["position"][1] - potential_pos[1]) < 100):
                conflict = True
                break

        if not conflict:
            uhr = potential_pos
            clock_spawn_cooldown = 60  # 1 second cooldown between clock spawns

    spawn_timer_uhr = 0
    # Set next spawn interval (30-60 seconds)
    spawn_interval_uhr = random.randint(30 * FPS, 60 * FPS)


def spawn_clock2_powerup():
    """Spawn Clock 2 (bad) powerup"""
    global uhr2, spawn_timer_uhr2, spawn_interval_uhr2, clock_spawn_cooldown

    if not uhr2 and clock_spawn_cooldown <= 0:
        # Choose random position (top or bottom)
        potential_pos = [WIDTH, random.choice([60, HEIGHT - uhr2_size - 60])]

        # Check for conflicts with spikes
        conflict = False
        for spike in spikes:
            if (abs(spike["position"][0] - potential_pos[0]) < 200 and
                    abs(spike["position"][1] - potential_pos[1]) < 100):
                conflict = True
                break

        if not conflict:
            uhr2 = potential_pos
            clock_spawn_cooldown = 60  # 1 second cooldown between clock spawns

    spawn_timer_uhr2 = 0
    # Set next spawn interval (30-60 seconds)
    spawn_interval_uhr2 = random.randint(30 * FPS, 60 * FPS)


def update_clock_system():
    """Update clock power-up system"""
    global spawn_timer_uhr, spawn_timer_uhr2, clock_spawn_cooldown
    global uhr, uhr2, clock_active, clock2_active, clock_timer, clock2_timer
    global pending_physics_reset

    # Decrease spawn cooldown
    if clock_spawn_cooldown > 0:
        clock_spawn_cooldown -= 1

    # Update spawn timers and spawn clocks
    spawn_timer_uhr += 1
    spawn_timer_uhr2 += 1

    # Spawn Clock 1 (good)
    if spawn_timer_uhr >= spawn_interval_uhr:
        spawn_clock_powerup()

    # Spawn Clock 2 (bad)
    if spawn_timer_uhr2 >= spawn_interval_uhr2:
        spawn_clock2_powerup()

    # Move existing clocks
    if uhr:
        uhr[0] -= game_speed
        if uhr[0] < -uhr_size:
            uhr = None

    if uhr2:
        uhr2[0] -= game_speed
        if uhr2[0] < -uhr2_size:
            uhr2 = None

    # Check collision with Clock 1 (good)
    if uhr and not clock_active and not clock2_active:
        if (player_pos[0] < uhr[0] + uhr_size and
                player_pos[0] + player_size[0] > uhr[0] and
                player_pos[1] < uhr[1] + uhr_size and
                player_pos[1] + player_size[1] > uhr[1]):
            uhr = None
            clock_active = True
            clock_timer = clock_duration
            apply_clock_physics('slow')

    # Check collision with Clock 2 (bad)
    if uhr2 and not clock_active and not clock2_active:
        if (player_pos[0] < uhr2[0] + uhr2_size and
                player_pos[0] + player_size[0] > uhr2[0] and
                player_pos[1] < uhr2[1] + uhr2_size and
                player_pos[1] + player_size[1] > uhr2[1]):
            uhr2 = None
            clock2_active = True
            clock2_timer = clock_duration
            apply_clock_physics('fast')

    # Update Clock 1 timer
    if clock_active:
        clock_timer -= 1 / FPS
        if clock_timer <= 0:
            clock_active = False
            if is_player_grounded():
                reset_physics()
            else:
                pending_physics_reset = True

    # Update Clock 2 timer
    if clock2_active:
        clock2_timer -= 1 / FPS
        if clock2_timer <= 0:
            clock2_active = False
            if is_player_grounded():
                reset_physics()
            else:
                pending_physics_reset = True

    # Check for physics reset when landing
    if pending_physics_reset and is_player_grounded():
        reset_physics()


def draw_clock_powerups():
    """Draw clock power-ups"""
    # Draw Clock 1 (good)
    if uhr:
        screen.blit(uhr_image, uhr)

    # Draw Clock 2 (bad)
    if uhr2:
        screen.blit(uhr2_image, uhr2)


def draw_clock_effects():
    """Draw visual indicators for active clock effects"""
    effect_font = pygame.font.Font('freesansbold.ttf', 18)

    if clock_active:
        # Green indicator for slow/good effect
        effect_text = effect_font.render(f"SLOW TIME: {clock_timer:.1f}s", True, GREEN)
        screen.blit(effect_text, (10, 50))

        # Optional: Add a subtle screen tint for slow effect
        slow_overlay = pygame.Surface((WIDTH, HEIGHT))
        slow_overlay.set_alpha(20)
        slow_overlay.fill((0, 255, 0))  # Light green tint
        screen.blit(slow_overlay, (0, 0))

    if clock2_active:
        # Red indicator for fast/bad effect
        effect_text = effect_font.render(f"SPEED CHAOS: {clock2_timer:.1f}s", True, (255, 100, 100))
        screen.blit(effect_text, (10, 50))

        # Optional: Add a subtle screen tint for fast effect
        fast_overlay = pygame.Surface((WIDTH, HEIGHT))
        fast_overlay.set_alpha(25)
        fast_overlay.fill((255, 0, 0))  # Light red tint
        screen.blit(fast_overlay, (0, 0))


def handle_jump_input():
    """Handle jump input with modified physics"""
    global is_moving_up, is_moving_down, destination_pos, current_image
    global air_jump_used, jumps, game_speed, movement_speed

    # Use current_movement_speed and current_acceleration instead of hardcoded values

    # Sprung von unten nach oben
    if player_pos[1] == HEIGHT - player_size[1] - 40 and not is_moving_up and not is_moving_down:
        is_moving_up = True
        destination_pos = 40
        current_image = player_image_up
        air_jump_used = False
        jumps += 1
        game_speed += 0.01
        movement_speed = current_movement_speed  # Use modified speed

    # Sprung von oben nach unten
    elif player_pos[1] == 40 and not is_moving_up and not is_moving_down:
        is_moving_down = True
        destination_pos = HEIGHT - player_size[1] - 40
        current_image = player_image_down
        air_jump_used = False
        jumps += 1
        game_speed += 0.01
        movement_speed = current_movement_speed  # Use modified speed

    # Richtungswechsel während Aufwärtsbewegung (in der Luft) - nur einmal
    elif is_moving_up and not air_jump_used:
        is_moving_up = False
        is_moving_down = True
        destination_pos = HEIGHT - player_size[1] - 40
        current_image = player_image_down
        movement_speed = current_movement_speed * 1.2  # Slightly faster for air control
        air_jump_used = True
        jumps += 1
        game_speed += 0.01

    # Richtungswechsel während Abwärtsbewegung (in der Luft) - nur einmal
    elif is_moving_down and not air_jump_used:
        is_moving_down = False
        is_moving_up = True
        destination_pos = 40
        current_image = player_image_up
        movement_speed = current_movement_speed * 1.2  # Slightly faster for air control
        air_jump_used = True
        jumps += 1
        game_speed += 0.01


def update_player_movement():
    """Update player movement with modified physics"""
    global movement_speed, is_moving_up, is_moving_down, air_jump_used

    # Bewegung der Spielfigur with current acceleration
    if is_moving_up:
        player_pos[1] -= movement_speed
        movement_speed += current_acceleration  # Use modified acceleration
        if player_pos[1] <= destination_pos:
            player_pos[1] = destination_pos
            is_moving_up = False
            air_jump_used = False
            movement_speed = current_movement_speed
    elif is_moving_down:
        player_pos[1] += movement_speed
        movement_speed += current_acceleration  # Use modified acceleration
        if player_pos[1] >= destination_pos:
            player_pos[1] = destination_pos
            is_moving_down = False
            air_jump_used = False
            movement_speed = current_movement_speed


# Lade alle Daten beim Start
load_all_data()


def get_difficulty_factor():
    """Berechnet Schwierigkeitsfaktor basierend auf gesammelten Münzen"""
    return min(coins_collected / 10.0, 1.0)  # Max Schwierigkeit bei 10 Münzen


def choose_spike_pattern():
    """Wählt ein intelligentes Spike-Muster basierend auf Schwierigkeit und letzten Mustern"""
    global current_pattern, pattern_progress, pattern_length, consecutive_same_position

    difficulty = get_difficulty_factor()

    # Verhindere zu viele aufeinanderfolgende Spikes an gleicher Position
    if consecutive_same_position >= 3:
        available_patterns = ["alternating", "safe_zone", "double_gap"]
    else:
        available_patterns = spike_patterns.copy()

    # Schwierigkeitsbasierte Musterauswahl
    if difficulty < 0.3:  # Anfänger
        available_patterns = ["single_top", "single_bottom", "safe_zone", "gap_top", "gap_bottom"]
    elif difficulty < 0.6:  # Mittel
        available_patterns = ["single_top", "single_bottom", "alternating", "gap_top", "gap_bottom", "double_gap"]
    # Schwer: Alle Muster verfügbar

    current_pattern = random.choice(available_patterns)
    pattern_progress = 0

    # Musterlänge festlegen
    if current_pattern == "safe_zone":
        pattern_length = random.randint(2, 4)
    elif current_pattern == "alternating":
        pattern_length = random.randint(3, 6)
    elif current_pattern == "double_gap":
        pattern_length = 4
    else:
        pattern_length = random.randint(1, 3)


def spawn_spike_with_pattern():
    """Spawnt Spikes basierend auf dem aktuellen Muster"""
    global pattern_progress, consecutive_same_position, last_spike_positions

    if current_pattern == "safe_zone":
        # Keine Spikes spawnen
        return

    elif current_pattern == "single_top":
        spikes.append({
            "position": [WIDTH, 40],
            "image": spike_image_reverse,
        })
        track_spike_position("top")

    elif current_pattern == "single_bottom":
        spikes.append({
            "position": [WIDTH, HEIGHT - spike_size - 34],
            "image": spike_image,
        })
        track_spike_position("bottom")

    elif current_pattern == "alternating":
        if pattern_progress % 2 == 0:
            spikes.append({
                "position": [WIDTH, 40],
                "image": spike_image_reverse,
            })
            track_spike_position("top")
        else:
            spikes.append({
                "position": [WIDTH, HEIGHT - spike_size - 34],
                "image": spike_image,
            })
            track_spike_position("bottom")

    elif current_pattern == "gap_top":
        # Spike unten, Lücke oben
        spikes.append({
            "position": [WIDTH, HEIGHT - spike_size - 34],
            "image": spike_image,
        })
        track_spike_position("bottom")

    elif current_pattern == "gap_bottom":
        # Spike oben, Lücke unten
        spikes.append({
            "position": [WIDTH, 40],
            "image": spike_image_reverse,
        })
        track_spike_position("top")

    elif current_pattern == "double_gap":
        if pattern_progress == 0 or pattern_progress == 3:
            # Beide Positionen blockiert - Spieler muss springen
            spikes.append({
                "position": [WIDTH, 40],
                "image": spike_image_reverse,
            })
            spikes.append({
                "position": [WIDTH + spike_size + 10, HEIGHT - spike_size - 34],
                "image": spike_image,
            })
        elif pattern_progress == 1:
            # Nur oben
            spikes.append({
                "position": [WIDTH, 40],
                "image": spike_image_reverse,
            })
        else:  # pattern_progress == 2
            # Nur unten
            spikes.append({
                "position": [WIDTH, HEIGHT - spike_size - 34],
                "image": spike_image,
            })


def track_spike_position(position):
    """Verfolgt Spike-Positionen für intelligenteres Spawning"""
    global consecutive_same_position, last_spike_positions

    last_spike_positions.append(position)
    if len(last_spike_positions) > 5:
        last_spike_positions.pop(0)

    # Zähle aufeinanderfolgende gleiche Positionen
    if len(last_spike_positions) >= 2 and last_spike_positions[-1] == last_spike_positions[-2]:
        consecutive_same_position += 1
    else:
        consecutive_same_position = 0


# ===== MAIN GAME LOOP =====
# Spielloop
while True:
    screen.fill((135, 206, 250))  # Hintergrundfarbe

    # Event-Handling
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            pygame.quit()
            sys.exit()

        # Name-Eingabe (erstes Mal sterben) - LEERTASTE DEAKTIVIERT FÜR EINGABE
        if entering_name:
            if event.type == pygame.KEYDOWN:
                clean_name = player_name.replace(" ", "")  # Leerzeichen entfernen
                if (event.key == pygame.K_SPACE or event.key == pygame.K_RETURN) and len(clean_name) >= 2:
                    player_name = clean_name  # Finale Namen ohne Leerzeichen speichern
                    entering_name = False
                    first_death = False
                    show_highscore_screen = True
                    # Daten speichern und laden für aktuellen Screen
                    save_score_data(current_score)
                    load_all_data()  # Aktuelle Rankings für den Death Screen laden
                elif event.key == pygame.K_BACKSPACE:
                    player_name = player_name[:-1]
                elif event.unicode.isprintable() and len(player_name) < 15:
                    # ALLE Zeichen außer Leerzeichen erlauben
                    if event.unicode != ' ':  # Leerzeichen blockieren
                        player_name += event.unicode.upper()

        # Kombinierter Death Screen
        elif show_highscore_screen:
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    # Neues Spiel starten
                    show_highscore_screen = False
                    game_over = False
                    player_pos = [50, HEIGHT - player_size[1] - 40]
                    current_image = player_image_down
                    coins_collected = 0
                    timer = 0
                    spikes = []
                    coin = None
                    jumps = 0
                    air_jump_used = False
                    game_speed = 6.0
                    is_moving_up = False
                    is_moving_down = False
                    destination_pos = HEIGHT - player_size[1] - 40
                    # Reset Spike-Spawning-Variablen
                    last_spike_positions = []
                    consecutive_same_position = 0
                    current_pattern = None
                    pattern_progress = 0
                    pattern_length = 0
                    # Reset Clock System
                    clock_active = False
                    clock2_active = False
                    clock_timer = 0
                    clock2_timer = 0
                    uhr = None
                    uhr2 = None
                    spawn_timer_uhr = 0
                    spawn_timer_uhr2 = 0
                    clock_spawn_cooldown = 0
                    reset_physics()

        # Normale Spiel-Events
        elif not game_over and event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
            handle_jump_input()  # Use new function with modified physics

    # Spiellogik
    if not game_over and not entering_name and not show_highscore_screen:
        # Update clock system
        update_clock_system()

        # Update player movement with modified physics
        update_player_movement()

        # Verbessertes Spike-Spawn-System
        if spawn_timer_spike >= spawn_interval_spike:
            # Neues Muster wählen wenn aktuelles beendet ist
            if current_pattern is None or pattern_progress >= pattern_length:
                choose_spike_pattern()

            # Spike mit aktuellem Muster spawnen
            spawn_spike_with_pattern()
            pattern_progress += 1

            spawn_timer_spike = 0
        spawn_timer_spike += 1

        # Bewegung und Entfernung alter Spikes (mit globaler Geschwindigkeit)
        for spike in spikes[:]:
            spike["position"][0] -= game_speed
            if spike["position"][0] < -spike_size:
                spikes.remove(spike)

        # Münz-Spawn
        if spawn_timer_coin >= spawn_interval_coin and not coin:
            potential_coin_pos = [WIDTH, random.choice([40, HEIGHT - coin_size - 40])]
            if not any(
                    spike["position"][0] < potential_coin_pos[0] + coin_size and
                    spike["position"][0] + spike_size > potential_coin_pos[0] and
                    spike["position"][1] == potential_coin_pos[1]
                    for spike in spikes
            ):
                coin = potential_coin_pos
            spawn_timer_coin = 0
        spawn_timer_coin += 1

        # Bewegung und Entfernung von Münzen (mit globaler Geschwindigkeit)
        if coin:
            coin[0] -= game_speed
            if coin[0] < -coin_size:
                coin = None
            if (
                    coin and
                    player_pos[0] < coin[0] + coin_size and
                    player_pos[0] + player_size[0] > coin[0] and
                    player_pos[1] < coin[1] + coin_size and
                    player_pos[1] + player_size[1] > coin[1]
            ):
                coin = None
                coins_collected += 1
                game_speed += 0.1
                spawn_interval_coin = max(50, spawn_interval_coin - 10)
                spawn_interval_spike = max(80, spawn_interval_spike - 20)

        # Überprüfung: Kollision zwischen Spike und Spieler
        for spike in spikes:
            player_hitbox = pygame.Rect(
                player_pos[0] + player_size[0] * 0.1,
                player_pos[1] + player_size[1] * 0.1,
                player_size[0] * 0.8,
                player_size[1] * 0.8,
            )
            spike_hitbox = pygame.Rect(
                spike["position"][0] + spike_size * 0.1,
                spike["position"][1] + spike_size * 0.1,
                spike_size * 0.8,
                spike_size * 0.8,
            )
            if player_hitbox.colliderect(spike_hitbox):
                # Score berechnen
                current_score = calculate_score(coins_collected, timer, jumps)

                # Beim ersten Tod: Name eingeben
                if first_death:
                    entering_name = True
                else:
                    # Ansonsten: Direkt kombinierter Death Screen
                    show_highscore_screen = True
                    # Daten speichern und aktuelle Rankings laden
                    save_score_data(current_score)
                    load_all_data()

                game_over = True
                game_speed = 0
                movement_speed = 1

    # Timer aktualisieren
    if not game_over and not entering_name and not show_highscore_screen:
        timer += 1 / FPS
        game_speed += 0.001

    # Zeichnung nur wenn kein Overlay aktiv ist
    if not entering_name and not show_highscore_screen:
        # Zeichnung des bewegenden Bodens (mit globaler Geschwindigkeit)
        for i in range(len(boden_positions)):
            boden_positions[i] -= game_speed
            if boden_positions[i] <= -boden_image_width:
                boden_positions[i] += len(boden_positions) * boden_image_width
            screen.blit(boden_image, (boden_positions[i], HEIGHT - 10 - boden_image.get_height()))

        # Zeichnung der bewegenden Decke (mit globaler Geschwindigkeit)
        for i in range(len(decke_positions)):
            decke_positions[i] -= game_speed
            if decke_positions[i] <= -boden_image_width:
                decke_positions[i] += len(decke_positions) * boden_image_width
            screen.blit(pygame.transform.flip(boden_image, False, True), (decke_positions[i], 10))

        # Zeichnung der braunen Bereiche
        pygame.draw.rect(screen, BROWN, (0, HEIGHT - 10, WIDTH, 40))
        pygame.draw.rect(screen, BROWN, (0, -30, WIDTH, 40))

        # Spielfigur
        screen.blit(current_image, player_pos)

        # Münze
        if coin:
            screen.blit(coin_image, coin)

        # Clock Power-ups
        draw_clock_powerups()

        # Hindernisse (Spikes)
        for spike in spikes:
            screen.blit(spike["image"], spike["position"])

        # Punkte und Timer im oberen Bereich
        timer_text = font.render(f"Time: {timer:.1f}", True, WHITE)
        coins_text = font.render(f"Coins: {coins_collected}", True, WHITE)
        jumps_text = font.render(f"Jumps: {jumps}", True, WHITE)
        screen.blit(timer_text, (10, 10))
        screen.blit(jumps_text, (160, 10))
        screen.blit(coins_text, (310, 10))

        # Clock effect indicators
        draw_clock_effects()

    # Overlays zeichnen
    if entering_name:
        draw_name_input()
    elif show_highscore_screen:
        draw_combined_death_screen()

    # Bildschirm aktualisieren
    pygame.display.flip()
    clock.tick(FPS)
