#version 150
//#extension GL_ARB_shading_language_420pack : require
#extension GL_ARB_explicit_attrib_location : require

#define TASK 10
#define ENABLE_OPACITY_CORRECTION 0
#define ENABLE_LIGHTNING 0
#define ENABLE_SHADOWING 0

in vec3 ray_entry_position;

layout(location = 0) out vec4 FragColor;

uniform mat4 Modelview;

uniform sampler3D volume_texture;
uniform sampler2D transfer_texture;


uniform vec3    camera_location;
uniform float   sampling_distance;
uniform float   sampling_distance_ref;
uniform float   iso_value;
uniform vec3    max_bounds;
uniform ivec3   volume_dimensions;

uniform vec3    light_position;
uniform vec3    light_ambient_color;
uniform vec3    light_diffuse_color;
uniform vec3    light_specular_color;
uniform float   light_ref_coef;


bool
inside_volume_bounds(const in vec3 sampling_position)
{
    return (   all(greaterThanEqual(sampling_position, vec3(0.0)))
            && all(lessThanEqual(sampling_position, max_bounds)));
}


float
get_sample_data(vec3 in_sampling_pos)
{
    vec3 obj_to_tex = vec3(1.0) / max_bounds;
    return texture(volume_texture, in_sampling_pos * obj_to_tex).r;

}

vec3
get_gradient(vec3 samp_pos)
{
    //step in jede richtung:
    float step = 1/length(vec3(volume_dimensions));


    float x_next = get_sample_data(vec3(samp_pos.x + step, samp_pos.y, samp_pos.z));
    float x_prev = get_sample_data(vec3(samp_pos.x - step, samp_pos.y, samp_pos.z));


    float y_next = get_sample_data(vec3(samp_pos.x, samp_pos.y + step, samp_pos.z));
    float y_prev = get_sample_data(vec3(samp_pos.x, samp_pos.y - step, samp_pos.z));


    float z_next = get_sample_data(vec3(samp_pos.x, samp_pos.y, samp_pos.z + step));
    float z_prev = get_sample_data(vec3(samp_pos.x, samp_pos.y, samp_pos.z + step));



    vec3 gradient = vec3((x_next - x_prev)/2, (y_next - y_prev)/2, (z_next - z_prev)/2);
    return gradient;
}

void main()
{
    /// One step trough the volume
    vec3 ray_increment      = normalize(ray_entry_position - camera_location) * sampling_distance;
    /// Position in Volume
    vec3 sampling_pos       = ray_entry_position + ray_increment; // test, increment just to be sure we are in the volume

    /// Init color of fragment
    vec4 dst = vec4(0.0, 0.0, 0.0, 0.0);

    /// check if we are inside volume
    bool inside_volume = inside_volume_bounds(sampling_pos);
    
    if (!inside_volume)
        discard;

// Max Intensity 
#if TASK == 10
    vec4 max_val = vec4(0.0, 0.0, 0.0, 0.0);
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume) 
    {      
        // get sample
        float s = get_sample_data(sampling_pos);
                
        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
           
        // this is the example for maximum intensity projection
        max_val.r = max(color.r, max_val.r);
        max_val.g = max(color.g, max_val.g);
        max_val.b = max(color.b, max_val.b);
        max_val.a = max(color.a, max_val.a);
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = max_val;
#endif 
    
// Average Intensity
#if TASK == 11
    vec4 clr_val = vec4(0.0, 0.0, 0.0, 0.0);
    int cnt = 0;

    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {      
        // get sample
        float s = get_sample_data(sampling_pos);

        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));
        cnt++;

        // sum up the color values for further avg calc
        clr_val.r = color.r + clr_val.r;
        clr_val.g = color.g + clr_val.g;
        clr_val.b = color.b + clr_val.b;
        clr_val.a = color.a + clr_val.a;
        
        // increment the ray sampling position
        sampling_pos  += ray_increment;

        // update the loop termination condition
        inside_volume  = inside_volume_bounds(sampling_pos);
    }

    dst = clr_val / cnt;
#endif
    
#if TASK == 12 || TASK == 13
    
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    bool hit = false;
    vec3 accurate_samp_pos;
    vec3 pos_next, pos_prev;

    while (inside_volume)
    {
        // get sample
        float s = get_sample_data(sampling_pos);
        
        // calculate iso distance
        float iso_dist = s - iso_value;

        // apply the transfer functions to retrieve color and opacity
        vec4 color = texture(transfer_texture, vec2(s, s));

        if (iso_dist > 0 && !hit) {
            hit = true;
            dst = color;

        
#if TASK == 13 // binary Search
        // restrict search depth
        int depth = 50;
        float accurate_s;

        pos_next = sampling_pos;
        pos_prev = sampling_pos - ray_increment;

        while (depth > 0)
        {
            accurate_samp_pos = (pos_next + pos_prev)/2; 
            accurate_s = get_sample_data(accurate_samp_pos);
            
            //if point is inside use last point
            if (accurate_s - iso_value > 0) {
                pos_next = accurate_samp_pos;
            } else {
                pos_prev = accurate_samp_pos;
            }

            depth -= 1;
        }

        accurate_s = get_sample_data(accurate_samp_pos);
        color = texture(transfer_texture, vec2(accurate_s,accurate_s));
        dst = color;
        sampling_pos = accurate_samp_pos;
        

#endif
#if ENABLE_LIGHTNING == 1 // Add Shading
            //phong lightning
            vec3 normal_vec = -normalize(get_gradient(sampling_pos));

            //Phong
            vec3 light_vec = normalize(light_position - sampling_pos); // from point to light p-> l
            vec3 camera_vec = normalize(camera_location - sampling_pos); // from p -> cam
            vec3 reflectedLight_vec = normalize(-reflect(light_vec, normal_vec));
            
            vec3 ambientTerm = light_ambient_color;// * ambient_color;
            ambientTerm = clamp(ambientTerm, 0.0, 1.0);

            // diffuse = light_diffuse * diffuse * (normal * TolightVec)
            vec3 diffuseTerm = light_diffuse_color * max(dot(normal_vec, light_vec), 0.0);
            diffuseTerm = clamp(diffuseTerm, 0.0, 1.0);

            // specular = light_diffuse * specular * (reflectedLightVec * toViewVec)^lightSpec
            vec3 specularTerm = light_specular_color * pow(max(dot(reflectedLight_vec, camera_vec), 0.0), light_ref_coef);
            specularTerm = clamp(specularTerm, 0.0, 1.0);

            dst = vec4(ambientTerm + diffuseTerm + specularTerm, 1);
            

            //dst = vec4(light_ambient_color + diffuseTerm + light_specular_color, 1);
            //dst = vec4(normal_vec, 1);


#if ENABLE_SHADOWING == 1 // Add Shadows

            // Same as beginning of main
            vec3 sh_increment = light_vec * sampling_distance;
            vec3 sh_pos  = sampling_pos + sh_increment;

            bool sh_inside_volume = true;
            bool sh_hit = false;
            while (sh_inside_volume) {
                // get sample
                float s_sh = get_sample_data(sh_pos);
                
                float sh_iso_dist = s_sh - iso_value;

                if (sh_iso_dist > 0){
                    if (sh_hit) {

                        dst = vec4(light_ambient_color, 1);
                    }
                    sh_hit = true;
                }
                // increment the sh ray pos
                sh_pos += sh_increment;
                sh_inside_volume = inside_volume_bounds(sh_pos);
            }

#endif
#endif

        } 

        // increment the ray sampling position
        sampling_pos += ray_increment;

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

#if TASK == 31
    // the traversal loop,
    // termination when the sampling position is outside volume boundarys
    // another termination condition for early ray termination is added
    while (inside_volume)
    {
        // get sample
#if ENABLE_OPACITY_CORRECTION == 1 // Opacity Correction
        IMPLEMENT;
#else
        float s = get_sample_data(sampling_pos);
#endif
        // dummy code
        dst = vec4(light_specular_color, 1.0);

        // increment the ray sampling position
        sampling_pos += ray_increment;

#if ENABLE_LIGHTNING == 1 // Add Shading
        IMPLEMENT;
#endif

        // update the loop termination condition
        inside_volume = inside_volume_bounds(sampling_pos);
    }
#endif 

    // return the calculated color value
    FragColor = dst;
}
